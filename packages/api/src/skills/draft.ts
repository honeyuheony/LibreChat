import { logger } from '@librechat/data-schemas';
import {
  SKILL_NAME_PATTERN,
  SKILL_DRAFT_EXTRAS,
  SKILL_DRAFT_OUTPUTS,
  SKILL_NAME_MAX_LENGTH,
  SKILL_DESCRIPTION_MAX_LENGTH,
} from 'librechat-data-provider';
import type {
  TModelSpec,
  TSkillDraft,
  TSkillFileKind,
  TSkillDraftExtra,
  TSkillDraftOutput,
  TSkillDraftRequest,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { EndpointDbMethods, ServerRequest } from '~/types';
import type { TaskAgentModel, TaskLLM } from '~/tasks/llm';
import { createTaskLLM, parseJsonObject } from '~/tasks/llm';
import { resolveRequestTenantId } from '~/middleware/tenant';

const MAX_TEXT_LENGTH = 20000;
const MAX_FILES = 50;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_TITLE_LENGTH = 60;
const MAX_LIST_ITEM_LENGTH = 200;
const CONTEXT_TURNS = 6;
const CONTEXT_TURN_CHARS = 600;
const SLUG_SUFFIX_LIMIT = 20;
/** 검증 안 됨: 제목 생성 호출의 체감 시간을 보고 정한 값이며 이 환경에서 측정하지 않았다. */
const DEFAULT_DRAFT_TIMEOUT_MS = 30000;

/** 초안 모델 응답은 요청 본문과 대화에서 나오므로 스킬 파일로 저장되기 전까지 믿지 않는다. */
export interface DraftContextMessage {
  isCreatedByUser?: boolean;
  text?: string | null;
  content?: unknown;
}

export interface SkillDraftDeps {
  /** 기본 agent 의 공급자·모델로 만든 모델. null 이면 규칙 기반 값만 쓴다. */
  getDraftLLM: (req: ServerRequest) => Promise<TaskLLM | null>;
  getConvo: (user: string, conversationId: string) => Promise<object | null>;
  getMessages: (
    filter: { conversationId: string; user: string },
    select?: string,
  ) => Promise<DraftContextMessage[]>;
  getAuthorSkillByName: (params: {
    name: string;
    author: string;
    tenantId?: string | null;
  }) => Promise<object | null>;
  timeoutMs?: number;
}

export interface DefaultAgentLLMDeps {
  getAgent: (search: { id: string }) => Promise<TaskAgentModel | null>;
  db: EndpointDbMethods;
}

type OutputRule = { output: TSkillDraftOutput; pattern: RegExp; slug: string; label: string };

const OUTPUT_RULES: OutputRule[] = [
  { output: 'report', pattern: /보고서|보고|리포트|report/i, slug: 'report', label: '보고서' },
  { output: 'summary', pattern: /요약|핵심만|summar/i, slug: 'summary', label: '요약' },
  {
    output: 'organize',
    pattern: /정리|분류|표로|목록|organi[sz]e/i,
    slug: 'organizer',
    label: '정리',
  },
  { output: 'ask', pattern: /질문|물어|문의|답변|answer|question/i, slug: 'qa', label: '답변' },
  {
    output: 'draft',
    pattern: /초안|작성|써\s*줘|메일|공문|draft|write/i,
    slug: 'draft',
    label: '초안',
  },
];

const DEFAULT_OUTPUT_RULE = OUTPUT_RULES[OUTPUT_RULES.length - 1];

const OUTPUT_ICONS: Record<TSkillDraftOutput, string> = {
  report: '📊',
  organize: '🗂️',
  summary: '📝',
  draft: '✍️',
  ask: '💬',
};

const EXTRA_RULES: Array<{ extra: TSkillDraftExtra; pattern: RegExp }> = [
  { extra: 'translate', pattern: /번역|영어로|영문으로|translat/i },
  { extra: 'polish', pattern: /다듬|교정|윤문|맞춤법|polish|proofread/i },
  { extra: 'law', pattern: /법령|법률|규정|조항|\blaw\b|regulation/i },
];

const TOPIC_SLUGS: Array<[RegExp, string]> = [
  [/회의|미팅|meeting/i, 'meeting'],
  [/주간|weekly/i, 'weekly'],
  [/월간|monthly/i, 'monthly'],
  [/계약|contract/i, 'contract'],
  [/보도자료|press/i, 'press-release'],
  [/민원|complaint/i, 'complaint'],
  [/예산|budget/i, 'budget'],
  [/출장/, 'business-trip'],
  [/채용|면접|hiring/i, 'hiring'],
  [/공문/, 'official-letter'],
  [/메일|email/i, 'email'],
];

const FILE_KIND_RULES: Array<[RegExp, TSkillFileKind]> = [
  [/양식|서식|템플릿|template|form/i, 'assets'],
  [/예시|샘플|보기|example|sample/i, 'examples'],
];

const PARTICLE_SUFFIX = /(에서|으로|에게|까지|부터|을|를|이|가|은|는|의|에|로|와|과|도|만)$/;
const REQUEST_WORDS = /(해\s*줘|해\s*주세요|만들어|써\s*줘|주세요|하기|한다|합니다)$/;

const OUTPUT_SET = new Set<string>(SKILL_DRAFT_OUTPUTS);
const EXTRA_SET = new Set<string>(SKILL_DRAFT_EXTRAS);
const FILE_KIND_SET = new Set<string>(['assets', 'examples', 'references']);

class DraftInputError extends Error {}

/** 기본 모델 프리셋이 가리키는 agent id. `default: true` 프리셋을 먼저, 없으면 agent 를 가진 첫 프리셋을 쓴다. */
export function resolveDefaultAgentId(
  modelSpecs: { list?: TModelSpec[] } | undefined | null,
): string | null {
  const list = modelSpecs?.list ?? [];
  const withAgent = list.filter((spec) => typeof spec?.preset?.agent_id === 'string');
  const chosen = withAgent.find((spec) => spec.default === true) ?? withAgent[0];
  return chosen?.preset?.agent_id ?? null;
}

/** 기본 agent 의 공급자·모델로 제목 생성과 같은 경로의 모델을 만든다. 기본 agent 가 없으면 null. */
export function createDefaultAgentLLMFactory(deps: DefaultAgentLLMDeps) {
  return async function getDraftLLM(req: ServerRequest): Promise<TaskLLM | null> {
    const agentId = resolveDefaultAgentId(
      req.config?.modelSpecs as { list?: TModelSpec[] } | undefined,
    );
    if (!agentId) {
      return null;
    }
    const agent = await deps.getAgent({ id: agentId });
    if (!agent) {
      return null;
    }
    return createTaskLLM({ req, agent, db: deps.db });
  };
}

/** 모델이 준 slug 를 스킬 이름 규칙에 맞춘다. 남는 글자가 없으면 null. */
export function sanitizeSkillSlug(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SKILL_NAME_MAX_LENGTH)
    .replace(/-+$/, '');
  return slug && SKILL_NAME_PATTERN.test(slug) ? slug : null;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max).trim() : value;
}

function readTrimmedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function readStringList(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items = value.filter((item): item is string => typeof item === 'string');
  if (items.length !== value.length) {
    return null;
  }
  return items
    .map((item) => item.trim())
    .filter((item) => item && item.length <= maxLength)
    .slice(0, maxItems);
}

function classifyFile(name: string): TSkillFileKind {
  return FILE_KIND_RULES.find(([pattern]) => pattern.test(name))?.[1] ?? 'references';
}

function extractKeywords(sentence: string): string[] {
  return sentence
    .split(/[\s,.!?·/()「」"'“”]+/)
    .map((word) => word.replace(REQUEST_WORDS, '').replace(PARTICLE_SUFFIX, ''))
    .filter((word) => word.length >= 2)
    .slice(0, 3);
}

function buildRuleDraft(input: TSkillDraftRequest): Omit<TSkillDraft, 'origin'> {
  const sentences = splitSentences(input.text);
  const first = sentences[0] ?? input.text.trim();
  const outputRule =
    OUTPUT_RULES.find((rule) => rule.pattern.test(input.text)) ?? DEFAULT_OUTPUT_RULE;
  const topic = TOPIC_SLUGS.find(([pattern]) => pattern.test(input.text))?.[1];
  const slug = sanitizeSkillSlug([topic, outputRule.slug].filter(Boolean).join('-')) ?? 'skill';
  const shortFirst = clip(first.replace(/[.!?。]+$/, ''), 20);
  const title = shortFirst.includes(outputRule.label)
    ? clip(shortFirst, MAX_TITLE_LENGTH)
    : clip(`${shortFirst} ${outputRule.label}`, MAX_TITLE_LENGTH);
  return {
    slug,
    title,
    description: clip(first, SKILL_DESCRIPTION_MAX_LENGTH),
    triggers: extractKeywords(first),
    output: outputRule.output,
    extras: EXTRA_RULES.filter((rule) => rule.pattern.test(input.text)).map((rule) => rule.extra),
    fields: [],
    icon: OUTPUT_ICONS[outputRule.output],
    steps: sentences
      .slice(1)
      .map((sentence) => clip(sentence, MAX_LIST_ITEM_LENGTH))
      .slice(0, 10),
    connectors: [],
    fileKinds: (input.files ?? []).map((file) => ({
      name: file.name,
      kind: classifyFile(file.name),
    })),
  };
}

function readIcon(value: unknown): string | null {
  const icon = readTrimmedString(value, 8);
  return icon && /\p{Extended_Pictographic}/u.test(icon) && !/[a-z0-9]/i.test(icon) ? icon : null;
}

function readFileKinds(
  value: unknown,
  fallback: TSkillDraft['fileKinds'],
): TSkillDraft['fileKinds'] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const suggested = new Map<string, TSkillFileKind>();
  for (const entry of value) {
    const name = (entry as { name?: unknown } | null)?.name;
    const kind = (entry as { kind?: unknown } | null)?.kind;
    if (typeof name === 'string' && typeof kind === 'string' && FILE_KIND_SET.has(kind)) {
      suggested.set(name, kind as TSkillFileKind);
    }
  }
  return fallback.map((file) => ({ name: file.name, kind: suggested.get(file.name) ?? file.kind }));
}

/** 모델 JSON 을 칸마다 검사해 형식이 맞는 값만 받고, 나머지는 규칙 기반 값으로 채운다. */
function mergeModelDraft(
  reply: Record<string, unknown>,
  rules: Omit<TSkillDraft, 'origin'>,
  connectorNames: Set<string>,
): TSkillDraft {
  const output =
    typeof reply.output === 'string' && OUTPUT_SET.has(reply.output)
      ? (reply.output as TSkillDraftOutput)
      : rules.output;
  const extras = Array.isArray(reply.extras)
    ? [...new Set(reply.extras.filter((extra): extra is TSkillDraftExtra => EXTRA_SET.has(extra)))]
    : rules.extras;
  const connectors = Array.isArray(reply.connectors)
    ? [...new Set(reply.connectors.filter((name): name is string => connectorNames.has(name)))]
    : rules.connectors;
  return {
    slug: sanitizeSkillSlug(reply.slug) ?? rules.slug,
    title: readTrimmedString(reply.title, MAX_TITLE_LENGTH) ?? rules.title,
    description:
      readTrimmedString(reply.description, SKILL_DESCRIPTION_MAX_LENGTH) ?? rules.description,
    triggers: readStringList(reply.triggers, 8, 40) ?? rules.triggers,
    output,
    extras,
    fields: readStringList(reply.fields, 12, 40) ?? rules.fields,
    icon: readIcon(reply.icon) ?? OUTPUT_ICONS[output],
    steps: readStringList(reply.steps, 10, MAX_LIST_ITEM_LENGTH) ?? rules.steps,
    connectors,
    fileKinds: readFileKinds(reply.fileKinds, rules.fileKinds),
    origin: 'model',
  };
}

function readDraftRequest(body: unknown): TSkillDraftRequest {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (typeof raw.text !== 'string' || !raw.text.trim()) {
    throw new DraftInputError('text is required');
  }
  if (raw.text.length > MAX_TEXT_LENGTH) {
    throw new DraftInputError(`text must be at most ${MAX_TEXT_LENGTH} characters`);
  }
  if (raw.direct !== undefined && typeof raw.direct !== 'boolean') {
    throw new DraftInputError('direct must be a boolean');
  }
  if (raw.files !== undefined && (!Array.isArray(raw.files) || raw.files.length > MAX_FILES)) {
    throw new DraftInputError(`files must be an array of at most ${MAX_FILES} entries`);
  }
  const files = (raw.files as unknown[] | undefined)?.map((file) => {
    const name = (file as { name?: unknown } | null)?.name;
    if (typeof name !== 'string' || !name.trim() || name.length > MAX_FILE_NAME_LENGTH) {
      throw new DraftInputError('each file needs a name');
    }
    return { name };
  });
  let context: TSkillDraftRequest['context'];
  if (raw.context !== undefined) {
    const conversationId = (raw.context as { conversationId?: unknown } | null)?.conversationId;
    if (typeof conversationId !== 'string' || !conversationId) {
      throw new DraftInputError('context.conversationId must be a string');
    }
    context = { conversationId };
  }
  return { text: raw.text, direct: raw.direct as boolean | undefined, files, context };
}

function readPartText(part: unknown): string {
  const text = (part as { text?: unknown } | null)?.text;
  return typeof text === 'string' ? text : '';
}

function readToolName(part: unknown): string | null {
  const name = (part as { tool_call?: { name?: unknown } } | null)?.tool_call?.name;
  return typeof name === 'string' && name ? name : null;
}

function summarizeConversation(messages: DraftContextMessage[]): {
  turns: string[];
  tools: string[];
} {
  const tools = new Set<string>();
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        const name = readToolName(part);
        if (name) {
          tools.add(name);
        }
      }
    }
  }
  const turns = messages.slice(-CONTEXT_TURNS).map((message) => {
    const parts = Array.isArray(message.content) ? message.content.map(readPartText).join('') : '';
    const text = (message.text || parts).trim();
    return `${message.isCreatedByUser ? '사용자' : '도우미'}: ${clip(text, CONTEXT_TURN_CHARS)}`;
  });
  return { turns, tools: [...tools].slice(0, 20) };
}

function buildDraftPrompt(
  input: TSkillDraftRequest,
  connectorNames: string[],
  conversation: { turns: string[]; tools: string[] } | null,
): string {
  const lines = [
    '사용자가 반복 업무를 맡길 agent(스킬)를 만들려고 한다. 아래 설명으로 스킬 초안을 만든다.',
    'JSON 객체 하나만 답한다. 설명 문장이나 코드 울타리는 쓰지 않는다. 키는 다음과 같다.',
    '- slug: 영문 소문자·숫자·하이픈만 쓴 짧은 이름',
    '- title: 한국어 이름(20자 안팎)',
    '- description: 이 스킬이 무엇을 하는지 한 문장',
    '- triggers: 이 스킬을 부를 만한 요청 키워드 배열(최대 8개)',
    `- output: ${SKILL_DRAFT_OUTPUTS.join(' | ')} 가운데 하나`,
    `- extras: ${SKILL_DRAFT_EXTRAS.join(', ')} 가운데 필요한 것의 배열`,
    '- fields: 보고서·표에 뽑을 항목 배열(없으면 빈 배열)',
    '- icon: 이모지 하나',
    '- steps: 일하는 순서를 적은 문장 배열(최대 10개)',
    `- connectors: 쓸 만한 커넥터 이름 배열. 고를 수 있는 것: ${connectorNames.join(', ') || '없음'}`,
    '- fileKinds: [{ name, kind }] 배열. kind 는 assets(양식) | examples(예시) | references(참고)',
    '',
    input.direct
      ? '아래 글은 사용자가 스킬 지시문으로 직접 쓴 것이다. 문장을 바꾸지 말고 칸만 채운다.'
      : '아래 글은 사용자가 업무를 설명한 것이다.',
    '<업무 설명>',
    input.text,
    '</업무 설명>',
  ];
  if (input.files?.length) {
    lines.push('', `올린 파일: ${input.files.map((file) => file.name).join(', ')}`);
  }
  if (conversation) {
    lines.push('', '<최근 대화>', ...conversation.turns, '</최근 대화>');
    lines.push(`대화에서 쓴 도구: ${conversation.tools.join(', ') || '없음'}`);
  }
  return lines.join('\n');
}

async function requestModelDraft(
  deps: SkillDraftDeps,
  req: ServerRequest,
  prompt: string,
): Promise<Record<string, unknown> | null> {
  try {
    const llm = await deps.getDraftLLM(req);
    if (!llm) {
      return null;
    }
    const reply = await llm.invoke(
      prompt,
      AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_DRAFT_TIMEOUT_MS),
    );
    const parsed = parseJsonObject(reply);
    if (!parsed) {
      logger.warn('[skillDraft] Model reply was not a JSON object; using rule-based draft');
    }
    return parsed;
  } catch (error) {
    // 초안은 보조 기능이라 모델 실패를 규칙 기반 값으로 대신하고, 원인은 로그로 남긴다.
    logger.warn('[skillDraft] Model call failed; using rule-based draft', error);
    return null;
  }
}

async function findFreeSlug(
  deps: SkillDraftDeps,
  base: string,
  author: string,
  tenantId: string | undefined,
): Promise<string> {
  for (let attempt = 1; attempt <= SLUG_SUFFIX_LIMIT; attempt++) {
    const suffix = attempt === 1 ? '' : `-${attempt}`;
    const candidate = `${base.slice(0, SKILL_NAME_MAX_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
    const existing = await deps.getAuthorSkillByName({ name: candidate, author, tenantId });
    if (!existing) {
      return candidate;
    }
  }
  return `${base.slice(0, SKILL_NAME_MAX_LENGTH - 9).replace(/-+$/, '')}-${Date.now().toString(36)}`;
}

/** `POST /api/skills/draft`: 업무 설명으로 스킬 칸 제안을 만든다. 저장하지 않는다. */
export function createSkillDraftHandler(deps: SkillDraftDeps) {
  return async function skillDraftHandler(req: ServerRequest, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    let input: TSkillDraftRequest;
    try {
      input = readDraftRequest(req.body);
    } catch (error) {
      if (error instanceof DraftInputError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }
    try {
      let conversation: { turns: string[]; tools: string[] } | null = null;
      if (input.context) {
        const { conversationId } = input.context;
        const convo = await deps.getConvo(userId, conversationId);
        if (!convo) {
          return res.status(404).json({ error: 'Conversation not found' });
        }
        const messages = await deps.getMessages(
          { conversationId, user: userId },
          'isCreatedByUser text content createdAt',
        );
        conversation = summarizeConversation(messages);
      }

      const connectorNames = Object.keys(req.config?.mcpConfig ?? {});
      const rules = buildRuleDraft(input);
      const reply = await requestModelDraft(
        deps,
        req,
        buildDraftPrompt(input, connectorNames, conversation),
      );
      const draft: TSkillDraft = reply
        ? mergeModelDraft(reply, rules, new Set(connectorNames))
        : { ...rules, origin: 'rules' };
      draft.slug = await findFreeSlug(deps, draft.slug, userId, resolveRequestTenantId(req));
      return res.status(200).json(draft);
    } catch (error) {
      logger.error('[skillDraft] Failed to build draft', error);
      return res.status(500).json({ error: 'Failed to build skill draft' });
    }
  };
}
