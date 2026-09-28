import { randomUUID } from 'crypto';
import { TaskTools } from 'librechat-data-provider';
import { tool } from '@librechat/agents/langchain/tools';
import type {
  TaskResult,
  TaskStats,
  TaskToolName,
  TaskProgressEvent,
  WriteReportArguments,
  ExtractTableArguments,
  SummarizeDocumentsArguments,
} from 'librechat-data-provider';
import type { StructuredToolInterface } from '@librechat/agents/langchain/tools';
import type { ReportTemplate } from './template';
import type { TaskDocument } from './documents';
import type { HwpService } from './hwpService';
import type { TaskCache } from './cache';
import type { TaskLLM } from './llm';
import { buildSummaryResult, mergeSummaries, summarizeDocuments } from './summarize';
import { buildTableResult, countTopValues } from './aggregate';
import { composeReport, renderFailureNotice } from './report';
import { extractFields, normalizeFields } from './extract';
import { TASK_TOOL_DEFINITIONS } from './definitions';
import { normalizeKey } from './cache';

/** tool artifact 를 담는 키다. `callbacks.js` 가 이 값을 메시지 첨부로 바꾼다. */
export const TASK_RESULT_ARTIFACT = 'task_result';

/** tool 별 단계 id 를 계획 카드 순서대로 둔다. 진행 이벤트의 `label` 에 한국어 문구가 실린다. */
export const TASK_STAGES: Record<TaskToolName, ReadonlyArray<{ id: string; label: string }>> = {
  [TaskTools.extract_table]: [
    { id: 'prepare', label: '문서 준비 상태 확인' },
    { id: 'confirm', label: '항목 확정' },
    { id: 'extract', label: '전체 문서에서 항목 추출' },
    { id: 'aggregate', label: '표 생성·집계(코드)' },
    { id: 'save', label: '결과 저장·검수 안내' },
  ],
  [TaskTools.summarize_documents]: [
    { id: 'prepare', label: '문서 준비 상태 확인' },
    { id: 'confirm', label: '관점 확정' },
    { id: 'summarize', label: '문서별 요약' },
    { id: 'merge', label: '통합 요약' },
    { id: 'save', label: '결과 저장·검수 안내' },
  ],
  [TaskTools.write_report]: [
    { id: 'prepare', label: '문서 준비 상태 확인' },
    { id: 'extract', label: '항목 추출' },
    { id: 'compose', label: '양식에 채우기(각주 포함)' },
    { id: 'render', label: 'HWP 생성' },
    { id: 'save', label: '결과 저장·검수 안내' },
  ],
};

export interface TaskToolDeps {
  conversationId?: string;
  loadDocuments(args: { conversationId: string; fileIds?: string[] }): Promise<TaskDocument[]>;
  getLLM(): Promise<TaskLLM>;
  cache: TaskCache;
  saveResult(result: TaskResult): Promise<void>;
  loadTemplate(templateId: string): Promise<ReportTemplate>;
  hwp: Pick<HwpService, 'render'>;
  saveReportFile(file: { buffer: Buffer; filename: string }): Promise<{
    file_id: string;
    filename: string;
  }>;
  onProgress?(event: TaskProgressEvent): void | Promise<void>;
  concurrency?: number;
  now?: () => number;
  createId?: () => string;
}

/** 첨부에 싣는 내용은 일부러 작게 둔다. 행과 본문은 결과 저장소에서 읽는다. */
export interface TaskResultArtifact {
  resultId: string;
  kind: TaskResult['kind'];
  title: string;
  stats: TaskStats;
  file?: { file_id: string; filename: string };
  /** 보고서 본문은 있지만 HWPX 를 만들지 못했을 때만 있다. */
  notice?: string;
}

type ToolReturn = [string, Record<string, TaskResultArtifact> | undefined];

interface TaskToolConfig {
  toolCall?: { id?: string };
  configurable?: { thread_id?: string };
  signal?: AbortSignal;
}

const NO_DOCUMENTS_MESSAGE =
  '문서가 없습니다. +로 파일을 올리면 전체 문서를 읽고 처리합니다. 이 문장을 사용자에게 그대로 안내하세요.';
const COUNTS_ON_SCREEN =
  '반영 문서 수·값 없음·확인 필요 건수는 화면에 표시되므로 숫자를 문장으로 되풀이하지 마세요.';

function toArtifact(result: TaskResult, extra: Partial<TaskResultArtifact> = {}): ToolReturn[1] {
  return {
    [TASK_RESULT_ARTIFACT]: {
      resultId: result.resultId,
      kind: result.kind,
      title: result.title,
      stats: result.stats,
      ...extra,
    },
  };
}

function createProgress(deps: TaskToolDeps, toolName: TaskToolName, toolCallId: string) {
  const stages = TASK_STAGES[toolName];
  return async (stageId: string, done = 0, total = 0) => {
    const stage = stages.find((entry) => entry.id === stageId);
    await deps.onProgress?.({
      toolCallId,
      stage: stageId,
      done,
      total,
      label: stage?.label ?? stageId,
    });
  };
}

async function runExtractTable(
  args: ExtractTableArguments,
  deps: TaskToolDeps,
  context: { conversationId: string; toolCallId: string; signal?: AbortSignal },
): Promise<ToolReturn> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const progress = createProgress(deps, TaskTools.extract_table, context.toolCallId);
  const fields = normalizeFields(args.fields ?? []);
  if (fields.length === 0) {
    return ['추출할 항목이 없습니다. 항목(fields)을 하나 이상 넣어 다시 부르세요.', undefined];
  }
  await progress('prepare');
  const docs = await deps.loadDocuments({
    conversationId: context.conversationId,
    fileIds: args.file_ids,
  });
  if (docs.length === 0) {
    return [NO_DOCUMENTS_MESSAGE, undefined];
  }
  const llm = await deps.getLLM();
  await progress('extract', 0, docs.length);
  const rows = await extractFields({
    docs,
    fields,
    llm,
    cache: deps.cache,
    signal: context.signal,
    concurrency: deps.concurrency,
    onSettled: (done, total) => progress('extract', done, total),
  });
  await progress('aggregate');
  const result = buildTableResult({
    resultId: (deps.createId ?? randomUUID)(),
    conversationId: context.conversationId,
    title: `비교표 · ${fields.join(' · ')}`,
    fields,
    rows,
    model: llm.model,
    startedAt,
    finishedAt: now(),
  });
  await progress('save');
  await deps.saveResult(result);

  const topValues = fields.map((field, index) => {
    const top = countTopValues(rows, index)
      .map(({ value, count }) => `${value}(${count})`)
      .join(', ');
    return `- ${field}: ${top || '값 없음'}`;
  });
  return [
    [
      `비교표를 만들어 화면에 표시했습니다. 표를 다시 그리지 말고 눈에 띄는 차이만 한두 줄로 적으세요. ${COUNTS_ON_SCREEN}`,
      '항목별 상위 값(건수, 코드 집계):',
      ...topValues,
    ].join('\n'),
    toArtifact(result),
  ];
}

async function runSummarizeDocuments(
  args: SummarizeDocumentsArguments,
  deps: TaskToolDeps,
  context: { conversationId: string; toolCallId: string; signal?: AbortSignal },
): Promise<ToolReturn> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const progress = createProgress(deps, TaskTools.summarize_documents, context.toolCallId);
  const view = normalizeKey(args.view ?? '');
  if (!view) {
    return [
      '요약 관점이 정해지지 않았습니다. 사용자에게 views 가운데 하나를 고르게 한 뒤 view 를 넣어 다시 부르세요.',
      undefined,
    ];
  }
  await progress('prepare');
  const docs = await deps.loadDocuments({
    conversationId: context.conversationId,
    fileIds: args.file_ids,
  });
  if (docs.length === 0) {
    return [NO_DOCUMENTS_MESSAGE, undefined];
  }
  const llm = await deps.getLLM();
  await progress('summarize', 0, docs.length);
  const summaries = await summarizeDocuments({
    docs,
    view,
    llm,
    cache: deps.cache,
    signal: context.signal,
    concurrency: deps.concurrency,
    onSettled: (done, total) => progress('summarize', done, total),
  });
  await progress('merge');
  const merged = await mergeSummaries({ summaries, view, llm, signal: context.signal });
  const result = buildSummaryResult({
    resultId: (deps.createId ?? randomUUID)(),
    conversationId: context.conversationId,
    view,
    summaries,
    merged,
    startedAt,
    finishedAt: now(),
  });
  await progress('save');
  await deps.saveResult(result);
  return [
    [
      `통합 요약(관점: ${view})을 화면 오른쪽에 열었습니다. 본문을 다시 쓰지 말고 가장 중요한 점만 한두 줄로 적으세요. ${COUNTS_ON_SCREEN}`,
      '전체 경향:',
      merged.trend,
    ].join('\n'),
    toArtifact(result),
  ];
}

async function runWriteReport(
  args: WriteReportArguments,
  deps: TaskToolDeps,
  context: { conversationId: string; toolCallId: string; signal?: AbortSignal },
): Promise<ToolReturn> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const progress = createProgress(deps, TaskTools.write_report, context.toolCallId);
  const template = await deps.loadTemplate(args.template_id);
  const fields = normalizeFields(
    args.fields != null && args.fields.length > 0 ? args.fields : template.fields,
  );
  await progress('prepare');
  const docs = await deps.loadDocuments({
    conversationId: context.conversationId,
    fileIds: args.file_ids,
  });
  if (docs.length === 0) {
    return [NO_DOCUMENTS_MESSAGE, undefined];
  }
  const llm = await deps.getLLM();
  await progress('extract', 0, docs.length);
  const rows = await extractFields({
    docs,
    fields,
    llm,
    cache: deps.cache,
    signal: context.signal,
    concurrency: deps.concurrency,
    onSettled: (done, total) => progress('extract', done, total),
  });
  await progress('compose');
  const { result, render } = await composeReport({
    resultId: (deps.createId ?? randomUUID)(),
    conversationId: context.conversationId,
    template,
    fields,
    rows,
    llm,
    signal: context.signal,
    startedAt,
    now,
  });
  await progress('render');
  const rendered = await deps.hwp.render(render, context.signal);
  let notice: string | undefined;
  if (rendered.ok) {
    result.file = await deps.saveReportFile({
      buffer: rendered.buffer,
      filename: rendered.filename,
    });
  } else {
    notice = renderFailureNotice(rendered.code);
  }
  await progress('save');
  await deps.saveResult(result);
  const reply = rendered.ok
    ? `HWP 보고서 초안(${result.file?.filename})을 만들어 화면 오른쪽에 열었습니다. 본문을 다시 쓰지 말고 짧게 답하세요. ${COUNTS_ON_SCREEN}`
    : `${notice} 이 안내를 사용자에게 그대로 전하고, HWP 파일을 만들었다고 말하지 마세요. (변환 서버 응답: ${rendered.code})`;
  return [
    reply,
    toArtifact(result, { ...(result.file && { file: result.file }), ...(notice && { notice }) }),
  ];
}

/** task tool 이름 하나로 실행용 tool 을 만든다. schema 는 `TASK_TOOL_DEFINITIONS` 의 것을 그대로 쓴다. */
export function createTaskTool(name: TaskToolName, deps: TaskToolDeps): StructuredToolInterface {
  const definition = TASK_TOOL_DEFINITIONS[name];
  return tool(
    async (rawArgs: unknown, config?: TaskToolConfig): Promise<ToolReturn> => {
      const conversationId = config?.configurable?.thread_id ?? deps.conversationId;
      if (!conversationId) {
        return ['대화 정보를 찾지 못해 작업을 시작하지 못했습니다.', undefined];
      }
      const context = {
        conversationId,
        toolCallId: config?.toolCall?.id ?? '',
        signal: config?.signal,
      };
      if (name === TaskTools.extract_table) {
        return runExtractTable(rawArgs as ExtractTableArguments, deps, context);
      }
      if (name === TaskTools.summarize_documents) {
        return runSummarizeDocuments(rawArgs as SummarizeDocumentsArguments, deps, context);
      }
      return runWriteReport(rawArgs as WriteReportArguments, deps, context);
    },
    {
      name: definition.name,
      description: definition.description,
      schema: definition.schema as Record<string, unknown>,
      responseFormat: 'content_and_artifact',
    },
  );
}
