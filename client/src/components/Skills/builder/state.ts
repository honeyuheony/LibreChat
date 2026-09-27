import { composeSkillMarkdown } from 'librechat-data-provider';
import type {
  TSkill,
  TSkillDraft,
  TCreateSkill,
  TSkillDraftExtra,
  TSkillDraftOutput,
  TSkillPublishScope,
  TUpdateSkillPayload,
  TSkillBuilderState,
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
  slug: string;
  values: BuilderValues;
  manualMinutes: number;
  scope: TSkillPublishScope;
};

export type BuilderStep = { text: string; by: string };

export const SOURCE_AI = 'ai';
export const SOURCE_ME = 'me';

export const OUTPUTS: readonly TSkillDraftOutput[] = [
  'report',
  'organize',
  'summary',
  'draft',
  'ask',
];
export const EXTRAS: readonly TSkillDraftExtra[] = ['translate', 'polish', 'law'];
export const ICON_CHOICES: readonly string[] = [
  '🤖',
  '📈',
  '🌍',
  '📅',
  '✈️',
  '🗓️',
  '📋',
  '📊',
  '🎤',
  '🧾',
];
/** 뽑을 항목은 보고서·비교표일 때만 쓴다. */
export const FIELD_OUTPUTS: ReadonlySet<TSkillDraftOutput> = new Set(['report', 'organize']);

/** SKILL.md 본문에 적는 결과물 이름. 화면 문구가 아니라 내보내는 문서의 내용이다. */
const OUTPUT_DOC_LABEL: Record<TSkillDraftOutput, string> = {
  report: '보고서 문서',
  organize: '비교표',
  summary: '요약 문서',
  draft: '초안 문서',
  ask: '답변',
};
const EXTRA_DOC_LABEL: Record<TSkillDraftExtra, string> = {
  translate: '번역',
  polish: '문장 교정',
  law: '법령 확인',
};

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
export function isAiWritable(source: string | undefined): boolean {
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

export function toggleConnector(state: BuilderState, name: string): BuilderState {
  const connectors = state.values.connectors.includes(name)
    ? state.values.connectors.filter((item) => item !== name)
    : [...state.values.connectors, name];
  return { ...state, values: { ...state.values, connectors } };
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

function describe(values: BuilderValues): string {
  const summary = values.description.trim().replace(/\.?\s*$/, '');
  const triggers = values.triggers.filter(Boolean);
  const when = triggers.length > 0 ? ` 다음 요청에 사용: ${triggers.join(', ')}.` : '';
  return `${summary ? `${summary}.` : ''}${when}`.trim();
}

/** 시작 예문. 첫 키워드가 없으면 이름으로 만든다. */
export function starterPrompt(values: BuilderValues): string {
  const head = values.triggers[0] || values.title;
  return head ? `${head} 시작해줘` : '';
}

function resultLines(values: BuilderValues): string {
  const extras = values.extras.map((extra) => EXTRA_DOC_LABEL[extra]);
  const fields = FIELD_OUTPUTS.has(values.output) ? values.fields.filter(Boolean) : [];
  return [
    `- 형태: ${OUTPUT_DOC_LABEL[values.output]}${extras.length > 0 ? ` + ${extras.join(', ')}` : ''}`,
    ...(fields.length > 0 ? [`- 문서에서 뽑을 항목: ${fields.join(', ')}`] : []),
  ].join('\n');
}

function accessLines(values: BuilderValues): string {
  if (values.connectors.length === 0) {
    return '- 내부 시스템에 접근하지 않는다. 올린 문서만 사용한다.';
  }
  return `- MCP 서버: ${values.connectors.join(', ')}. 작성자가 선언한 MCP 서버에만 접근한다.`;
}

function metadataOf(values: BuilderValues) {
  const fields = FIELD_OUTPUTS.has(values.output) ? values.fields.filter(Boolean) : [];
  const metadata: Record<string, string | string[]> = { output: values.output };
  if (values.icon) metadata.icon = values.icon;
  if (values.triggers.length > 0) metadata.triggers = values.triggers;
  if (values.extras.length > 0) metadata.extras = values.extras;
  if (fields.length > 0) metadata.fields = fields;
  if (values.connectors.length > 0) metadata.connectors = values.connectors;
  return metadata;
}

function composeInput(state: BuilderState) {
  const { values } = state;
  const starter = starterPrompt(values);
  return {
    name: state.slug || 'new-agent',
    displayTitle: values.title.trim(),
    description: describe(values),
    examples: starter ? [starter] : [],
    metadata: metadataOf(values),
    instructions: composeSteps(state).map((step) => step.text),
    result: resultLines(values),
    access: accessLines(values),
  };
}

/** 원문 보기와 저장이 같은 SKILL.md 를 쓴다. */
export function toMarkdown(state: BuilderState): string {
  return composeSkillMarkdown(composeInput(state));
}

const FRONTMATTER_BLOCK = /^---\n[\s\S]*?\n---\n+/;

export function toBuilderRecord(state: BuilderState): TSkillBuilderState {
  return {
    text: state.text,
    direct: state.direct,
    ...(state.textBy ? { textBy: state.textBy } : {}),
    sources: state.sources,
    aiOff: state.aiOff,
  };
}

/** 본문은 frontmatter 를 뺀 SKILL.md 이고, frontmatter 는 따로 보낸다(기존 만들기 화면과 같은 모양). */
export function toSavePayload(state: BuilderState): TCreateSkill & TUpdateSkillPayload {
  const input = composeInput(state);
  const description = input.description || input.displayTitle || firstSentence(state.text);
  return {
    name: input.name,
    displayTitle: input.displayTitle,
    description,
    body: toMarkdown(state).replace(FRONTMATTER_BLOCK, ''),
    frontmatter: {
      title: input.displayTitle,
      description,
      examples: input.examples,
      metadata: input.metadata,
    },
    icon: state.values.icon || undefined,
    manualMinutes: state.manualMinutes > 0 ? state.manualMinutes : undefined,
    builder: toBuilderRecord(state),
  };
}

/** 저장한 내용과 지금 내용을 비교하는 값. 공개 범위는 게시 인자라서 넣지 않는다. */
export function contentSignature(state: BuilderState): string {
  return JSON.stringify(toSavePayload(state));
}

export type TodoKey = 'text' | 'minutes' | 'test';
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

export type PluginFile = { path: string; content: string };

/** 「만들어지는 폴더」: Claude 플러그인과 같은 배치이며 서버 내보내기와 같은 파일 이름을 쓴다. */
export function pluginFiles(state: BuilderState, author: string): PluginFile[] {
  const slug = state.slug || 'new-agent';
  const { values } = state;
  const files: PluginFile[] = [
    {
      path: '.claude-plugin/plugin.json',
      content: `${JSON.stringify(
        { name: slug, version: '0.1.0', description: values.description, author: { name: author } },
        null,
        2,
      )}\n`,
    },
    { path: `skills/${slug}/SKILL.md`, content: toMarkdown(state) },
  ];
  if (values.connectors.length > 0) {
    files.push({
      path: '.mcp.json',
      content: `${JSON.stringify(
        { mcpServers: Object.fromEntries(values.connectors.map((name) => [name, {}])) },
        null,
        2,
      )}\n`,
    });
  }
  files.push({
    path: 'README.md',
    content: [
      `# ${values.title}`,
      '',
      values.description,
      '',
      `- 만든 사람: ${author}`,
      '',
      '## 들어 있는 것',
      '',
      '| 폴더 | 이름 | 하는 일 |',
      '|---|---|---|',
      `| skills/${slug} | ${values.title} | ${values.description} |`,
      '',
      '## MCP 서버',
      '',
      values.connectors.length > 0
        ? values.connectors.map((name) => `- ${name}`).join('\n')
        : '- 없음. 올린 문서만 사용한다.',
      '',
    ].join('\n'),
  });
  return files;
}
