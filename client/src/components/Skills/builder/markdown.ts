import { composeSkillMarkdown } from 'librechat-data-provider';
import type {
  TCreateSkill,
  TSkillDraftExtra,
  TSkillDraftOutput,
  TUpdateSkillPayload,
  TSkillBuilderState,
} from 'librechat-data-provider';
import type { BuilderState, BuilderValues } from './state';
import { DRAFT_SLUG, FIELD_OUTPUTS, composeSteps, firstSentence, FRONTMATTER_BLOCK } from './state';

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
    name: state.slug || DRAFT_SLUG,
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

function toBuilderRecord(state: BuilderState): TSkillBuilderState {
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

export type PluginFile = { path: string; content: string };

/** 「만들어지는 폴더」: Claude 플러그인과 같은 배치이며 서버 내보내기와 같은 파일 이름을 쓴다. */
export function pluginFiles(state: BuilderState, author: string): PluginFile[] {
  const slug = state.slug || DRAFT_SLUG;
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
