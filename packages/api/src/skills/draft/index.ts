import { logger } from '@librechat/data-schemas';
import {
  SKILL_DRAFT_EXTRAS,
  SKILL_DRAFT_OUTPUTS,
  SKILL_NAME_MAX_LENGTH,
} from 'librechat-data-provider';
import type { TModelSpec, TSkillDraft, TSkillDraftRequest } from 'librechat-data-provider';
import type { Response } from 'express';
import type { EndpointDbMethods, ServerRequest } from '~/types';
import type { TaskAgentModel, TaskLLM } from '~/tasks/llm';
import { buildRuleDraft, mergeModelDraft, clip } from './rules';
import { createTaskLLM, parseJsonObject } from '~/tasks/llm';
import { resolveRequestTenantId } from '~/middleware/tenant';

export { sanitizeSkillSlug } from './rules';

const MAX_TEXT_LENGTH = 20000;
const MAX_FILES = 50;
const MAX_FILE_NAME_LENGTH = 255;
const CONTEXT_TURNS = 6;
const CONTEXT_TURN_CHARS = 600;
const SLUG_SUFFIX_LIMIT = 20;
/** 제목 생성 호출에 걸리는 체감 시간을 보고 정한 값이다. */
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
