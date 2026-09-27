import {
  SKILL_NAME_PATTERN,
  SKILL_DRAFT_EXTRAS,
  SKILL_DRAFT_OUTPUTS,
  SKILL_NAME_MAX_LENGTH,
  SKILL_DESCRIPTION_MAX_LENGTH,
} from 'librechat-data-provider';
import type {
  TSkillDraft,
  TSkillFileKind,
  TSkillDraftExtra,
  TSkillDraftOutput,
  TSkillDraftRequest,
} from 'librechat-data-provider';

const MAX_TITLE_LENGTH = 60;
const MAX_LIST_ITEM_LENGTH = 200;

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

export function clip(value: string, max: number): string {
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

export function buildRuleDraft(input: TSkillDraftRequest): Omit<TSkillDraft, 'origin'> {
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
export function mergeModelDraft(
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
