import type { TaskResult, TSkillDraftOutput } from 'librechat-data-provider';
import type { BuilderState } from './state';
import { SOURCE_CHAT, createBuilderState } from './state';

/** 「이 작업을 agent로 저장」이 대화에서 가져오는 문서 수. */
export const CHAT_FILE_LIMIT = 3;

/** 작업 결과에서 읽은, 대화에서 이미 정한 값. */
export type ChatConfirmed = { output: TSkillDraftOutput; fields: string[]; files: string[] };

const OUTPUT_OF_RESULT: Record<TaskResult['kind'], TSkillDraftOutput> = {
  table: 'organize',
  summary: 'summary',
  report: 'report',
};

/** agent 이름 뒤에 붙이는 결과물 이름. 화면 문구가 아니라 SKILL.md 에 저장하는 값이다. */
const OUTPUT_TITLE: Record<TSkillDraftOutput, string> = {
  organize: '비교표',
  report: '보고서',
  summary: '요약',
  draft: '초안',
  ask: '질의',
};

function resultFileNames(result: TaskResult): string[] {
  if (result.kind === 'table') {
    return result.rows.map((row) => row.filename);
  }
  return [...(result.perDoc ?? []), ...result.footnotes].map((doc) => doc.filename);
}

export function chatConfirmed(result: TaskResult): ChatConfirmed {
  return {
    output: OUTPUT_OF_RESULT[result.kind],
    fields: result.kind === 'table' ? result.fields : [],
    files: [...new Set(resultFileNames(result).filter(Boolean))].slice(0, CHAT_FILE_LIMIT),
  };
}

/** 마지막 요청을 글칸에 넣고, 대화에서 정한 칸은 「대화에서 확정」으로 채워 AI 초안이 덮지 않게 한다. */
export function chatState(
  text: string,
  confirmed: ChatConfirmed & { connectors: string[] },
): BuilderState {
  const initial = createBuilderState(text);
  const { output, fields, files, connectors } = confirmed;
  const hasFields = fields.length > 0;
  return {
    ...initial,
    sources: {
      output: SOURCE_CHAT,
      ...(hasFields ? { fields: SOURCE_CHAT, title: SOURCE_CHAT } : {}),
      ...(connectors.length > 0 ? { connectors: SOURCE_CHAT } : {}),
    },
    files: files.map((name) => ({ name, kind: 'examples' })),
    values: {
      ...initial.values,
      output,
      fields,
      title: hasFields ? `${fields.slice(0, 2).join('·')} ${OUTPUT_TITLE[output]}` : '',
      connectors,
    },
  };
}
