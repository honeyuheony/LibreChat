import type {
  TSkill,
  TSkillDraft,
  SkillFrontmatterValue,
  TSkillDraftExtra,
  TSkillFileKind,
  TSkillDraftOutput,
  TSkillPublishScope,
} from 'librechat-data-provider';

/** 미리보기에서 AI 가 채우고 사람이 고칠 수 있는 필드. `sources` 의 키이기도 하다. */
export type BuilderField =
  | 'title'
  | 'description'
  | 'triggers'
  | 'output'
  | 'fields'
  | 'icon'
  | 'extras';

export type BuilderValues = {
  title: string;
  description: string;
  triggers: string[];
  output: TSkillDraftOutput;
  fields: string[];
  icon: string;
  extras: TSkillDraftExtra[];
  connectors: string[];
};

/** `upload`·`path` 는 편집기에서 고른 문서에만 있다. 대화에서 가져온 문서는 이름뿐이라 저장하지 않는다. */
export type BuilderFile = { name: string; kind: TSkillFileKind; upload?: File; path?: string };

export type BuilderState = {
  text: string;
  direct: boolean;
  textBy?: string;
  /** 필드별 출처: `ai`, `me`, 또는 「원본 그대로」 같은 표시 글자. 비었으면 아직 값이 없다. */
  sources: Record<string, string>;
  /** 사람이 ✕ 로 뺀 AI 기본 줄. 다시 넣지 않는다. */
  aiOff: string[];
  /** 초안 요청이 돌려준 기본 줄. 글에서 다시 끌어내므로 저장하지 않는다. */
  aiSteps: string[];
  /** 초안이 추천한 커넥터. 켜는 것은 사람이 한다. */
  recommended: string[];
  /** 양식·예시·참고로 나눈 문서. 저장할 때 스킬 폴더에 올린다. */
  files: BuilderFile[];
  slug: string;
  values: BuilderValues;
  manualMinutes: number;
  scope: TSkillPublishScope;
};

export type BuilderStep = { text: string; by: string };

export const SOURCE_AI = 'ai';
export const SOURCE_ME = 'me';
export const SOURCE_ORIGIN = 'origin';
export const SOURCE_CHAT = 'chat';
/** 이름을 정하기 전 초안의 폴더 표시 이름. 저장할 때는 `agent-<시각>` 이름을 따로 붙인다. */
export const DRAFT_SLUG = 'agent-draft';

export const OUTPUTS: readonly TSkillDraftOutput[] = [
  'report',
  'organize',
  'summary',
  'draft',
  'ask',
];
const EXTRAS: readonly TSkillDraftExtra[] = ['translate', 'polish', 'law'];
/** 뽑을 항목은 보고서·비교표일 때만 쓴다. */
export const FIELD_OUTPUTS: ReadonlySet<TSkillDraftOutput> = new Set(['report', 'organize']);

const EMPTY_VALUES: BuilderValues = {
  title: '',
  description: '',
  triggers: [],
  output: 'report',
  fields: [],
  icon: '',
  extras: [],
  connectors: [],
};

export function createBuilderState(text = ''): BuilderState {
  return {
    text,
    direct: false,
    sources: {},
    aiOff: [],
    aiSteps: [],
    recommended: [],
    files: [],
    slug: '',
    values: { ...EMPTY_VALUES },
    manualMinutes: 0,
    scope: 'all',
  };
}

/** 줄바꿈과 `. ! ?` 로 문장을 나누고 줄 앞 번호(`1.`)를 지운다. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

export function firstSentence(text: string): string {
  return splitSentences(text)[0] ?? '';
}

/** 사람이 고치지 않았고 가져온 값도 아닌 필드만 AI 가 바꿀 수 있다. */
function isAiWritable(source: string | undefined): boolean {
  return !source || source === SOURCE_AI;
}

function isFilled(value: string | string[]): boolean {
  return Array.isArray(value) ? value.length > 0 : value.trim().length > 0;
}

export function applyDraft(state: BuilderState, draft: TSkillDraft): BuilderState {
  const proposed: Omit<BuilderValues, 'connectors'> = {
    title: draft.title,
    description: draft.description,
    triggers: draft.triggers,
    output: draft.output,
    fields: draft.fields,
    icon: draft.icon,
    extras: draft.extras,
  };
  const values = { ...state.values };
  const sources = { ...state.sources };
  for (const field of Object.keys(proposed) as BuilderField[]) {
    if (!isAiWritable(sources[field])) {
      continue;
    }
    const value = proposed[field];
    (values as Record<BuilderField, BuilderValues[BuilderField]>)[field] = value;
    sources[field] = isFilled(value as string | string[]) ? SOURCE_AI : '';
  }
  return {
    ...state,
    values,
    sources,
    aiSteps: draft.steps,
    recommended: draft.connectors,
    slug: state.slug || draft.slug,
  };
}

export function editField<K extends BuilderField>(
  state: BuilderState,
  field: K,
  value: BuilderValues[K],
): BuilderState {
  return {
    ...state,
    values: { ...state.values, [field]: value },
    sources: { ...state.sources, [field]: SOURCE_ME },
  };
}

/** 출처가 붙은 커넥터(「대화에서 확정」 등)를 사람이 바꾸면 「내가 고침」이 된다. */
export function toggleConnector(state: BuilderState, name: string): BuilderState {
  const connectors = state.values.connectors.includes(name)
    ? state.values.connectors.filter((item) => item !== name)
    : [...state.values.connectors, name];
  const sources = state.sources.connectors
    ? { ...state.sources, connectors: SOURCE_ME }
    : state.sources;
  return { ...state, sources, values: { ...state.values, connectors } };
}

const normalizeStep = (step: string) => step.replace(/[\s.]/g, '');

/** 「일하는 방법」: AI 기본 줄 뒤에 둘째 문장부터를 잇는다. 직접 모드에서는 모든 줄이 사람 것이다. */
export function composeSteps(state: BuilderState): BuilderStep[] {
  const sentences = splitSentences(state.text);
  const mine = state.direct ? sentences : sentences.slice(1);
  const mineNormalized = new Set(mine.map(normalizeStep));
  const off = new Set(state.aiOff);
  const ai =
    state.direct || sentences.length === 0
      ? []
      : state.aiSteps.filter((step) => !off.has(step) && !mineNormalized.has(normalizeStep(step)));
  const myBy = state.direct ? state.textBy || SOURCE_ME : SOURCE_ME;
  return [
    ...ai.map((text) => ({ text, by: SOURCE_AI })),
    ...mine.map((text) => ({ text, by: myBy })),
  ];
}

export const FRONTMATTER_BLOCK = /^---\n[\s\S]*?\n---\n+/;

type TodoKey = 'text' | 'minutes' | 'test';
export type TodoItem = { key: TodoKey; done: boolean };

export function todoItems(state: BuilderState, tested: boolean): TodoItem[] {
  return [
    { key: 'text', done: state.text.trim().length > 0 && state.values.title.trim().length > 0 },
    { key: 'minutes', done: state.manualMinutes > 0 },
    { key: 'test', done: tested },
  ];
}

export function isPublishReady(state: BuilderState, tested: boolean): boolean {
  return todoItems(state, tested).every((item) => item.done);
}

/** 서버가 기록한 시험이 지금 버전의 것이고 저장 뒤로 고친 곳이 없을 때만 통과다. */
export function isTested(skill: TSkill | undefined, dirty: boolean): boolean {
  return !dirty && skill?.lastTest != null && skill.lastTest.version === skill.version;
}

const BUILDER_FIELDS: readonly BuilderField[] = [
  'title',
  'description',
  'triggers',
  'output',
  'fields',
  'icon',
  'extras',
];

const asStrings = (value: SkillFrontmatterValue | undefined): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];

function frontmatterMetadata(
  skill: Pick<TSkill, 'frontmatter'>,
): Record<string, SkillFrontmatterValue | undefined> {
  const metadata = skill.frontmatter?.metadata;
  return metadata != null && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata
    : {};
}

/** SKILL.md `metadata` 아래 문자열 목록(`triggers`·`connectors` 등). 목록이 아니면 빈 배열이다. */
export function metadataList(skill: Pick<TSkill, 'frontmatter'>, key: string): string[] {
  return asStrings(frontmatterMetadata(skill)[key]);
}

/** 직접 모드로 쓴 원본은 글칸 원문을, 아니면 AI 줄까지 합쳐 저장된 본문 번호 목록을 쓴다. */
export function originalLines(skill: TSkill): string {
  if (skill.builder?.direct && skill.builder.text.trim()) {
    return skill.builder.text;
  }
  const lines = skill.body.trimStart().replace(FRONTMATTER_BLOCK, '').split('\n');
  const numbered = lines
    .map((line) => line.match(/^\s*\d+[.)]\s+(.*)$/)?.[1]?.trim())
    .filter((line): line is string => !!line);
  if (numbered.length > 0) {
    return numbered.join('\n');
  }
  return (
    skill.builder?.text ??
    lines
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .join('\n')
  );
}

/** 응용: 원본 글과 설정을 채운 직접 모드 상태. 칸마다 출처는 「원본 그대로」이고 이름 뒤에 부서를 붙인다. */
export function forkState(skill: TSkill, department?: string): BuilderState {
  const metadata = frontmatterMetadata(skill);
  const title = skill.displayTitle || skill.name;
  const output = OUTPUTS.find((item) => item === metadata.output) ?? EMPTY_VALUES.output;
  const icon = typeof metadata.icon === 'string' ? metadata.icon : '';
  return {
    ...createBuilderState(originalLines(skill)),
    direct: true,
    textBy: SOURCE_ORIGIN,
    sources: Object.fromEntries(BUILDER_FIELDS.map((field) => [field, SOURCE_ORIGIN])),
    values: {
      title: department ? `${title} (${department})` : title,
      description: skill.description.replace(/\s*다음 요청에 사용:.*$/s, ''),
      triggers: asStrings(metadata.triggers),
      output,
      fields: asStrings(metadata.fields),
      icon: skill.icon || icon,
      extras: EXTRAS.filter((extra) => asStrings(metadata.extras).includes(extra)),
      connectors: asStrings(metadata.connectors),
    },
    manualMinutes: skill.manualMinutes ?? 0,
    scope: skill.scope ?? 'all',
  };
}

export type ChangedField = BuilderField | 'text' | 'connectors';

/** 원본과 값이 달라진 칸. 「원본에서 변경」 표시에 쓴다. */
export function changedFields(state: BuilderState, orig: BuilderState): Set<ChangedField> {
  const keys: Array<keyof BuilderValues> = [...BUILDER_FIELDS, 'connectors'];
  const changed = new Set<ChangedField>(
    keys.filter((key) => JSON.stringify(state.values[key]) !== JSON.stringify(orig.values[key])),
  );
  if (state.text !== orig.text) {
    changed.add('text');
  }
  return changed;
}
