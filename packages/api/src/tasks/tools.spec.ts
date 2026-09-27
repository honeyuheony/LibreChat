import { TaskTools } from 'librechat-data-provider';
import type { TaskProgressEvent, TaskResult } from 'librechat-data-provider';
import type { HwpRenderOutcome, HwpRenderRequest } from './hwpService';
import type { TaskResultArtifact, TaskToolDeps } from './tools';
import type { ReportTemplate } from './template';
import { documentName, fakeLLM, makeDoc, memoryCache } from './__tests__/fakes.helper';
import { createTaskTool, TASK_RESULT_ARTIFACT } from './tools';
import { RENDER_UNAVAILABLE_NOTICE } from './report';

const docs = [
  makeDoc('f1', '담당 김 사무관. 금주 실적: 보고서 작성.', 'kim.hwp'),
  makeDoc('f2', '담당 이 주무관. 금주 실적: 자료 수집.', 'lee.hwpx'),
];

const template: ReportTemplate = {
  templateId: 'weekly-report',
  title: '{{팀}} 주간보고',
  fields: ['담당', '금주 실적'],
  slots: [
    {
      id: '금주 실적',
      kind: 'table_rows',
      columns: { 담당: '담당', 업무: '금주 실적', 비고: '@filename' },
    },
    { id: '원천', kind: 'list', source: 'filenames' },
  ],
};

const extraction: Record<string, unknown> = {
  'kim.hwp': {
    담당: { value: '김 사무관', quote: '김 사무관' },
    '금주 실적': { value: '보고서 작성', quote: '보고서 작성' },
    위험도: { value: null, quote: null },
  },
  'lee.hwpx': {
    담당: { value: '이 주무관', quote: '이 주무관' },
    '금주 실적': { value: '자료 수집', quote: '자료 수집' },
    위험도: { value: '높음', quote: '없는 인용' },
  },
};

function setup(render: (request: HwpRenderRequest) => HwpRenderOutcome, documents = docs) {
  const model = fakeLLM((prompt) =>
    prompt.startsWith('You write')
      ? { paragraphs: {}, title_values: { 팀: '정세분석팀' } }
      : extraction[documentName(prompt)],
  );
  const saved: TaskResult[] = [];
  const progress: TaskProgressEvent[] = [];
  const renders: HwpRenderRequest[] = [];
  const files: Array<{ filename: string; size: number }> = [];
  let id = 0;
  const deps: TaskToolDeps = {
    loadDocuments: async () => documents,
    getLLM: async () => model.llm,
    cache: memoryCache(),
    saveResult: async (result) => {
      saved.push(result);
    },
    loadTemplate: async () => template,
    hwp: {
      render: async (request) => {
        renders.push(request);
        return render(request);
      },
    },
    saveReportFile: async ({ buffer, filename }) => {
      files.push({ filename, size: buffer.length });
      return { file_id: 'file-hwpx', filename };
    },
    onProgress: (event) => {
      progress.push(event);
    },
    createId: () => `result-${++id}`,
    now: () => 1_000,
  };
  return { deps, saved, progress, renders, files, prompts: model.prompts };
}

async function call(name: TaskTools, args: Record<string, unknown>, deps: TaskToolDeps) {
  const message = await createTaskTool(name, deps).invoke(
    { id: 'call_1', name, args, type: 'tool_call' },
    { configurable: { thread_id: 'convo-1' } },
  );
  return message as unknown as {
    content: string;
    artifact?: Record<string, TaskResultArtifact>;
  };
}

describe('write_report tool', () => {
  it('saves the HWPX and attaches its file to the result when rendering succeeds', async () => {
    const bytes = Buffer.from('hwpx-bytes');
    const env = setup(() => ({
      ok: true,
      buffer: bytes,
      filename: '정세분석팀 주간보고 초안.hwpx',
    }));
    const message = await call(TaskTools.write_report, { template_id: 'weekly-report' }, env.deps);
    expect(env.files).toEqual([{ filename: '정세분석팀 주간보고 초안.hwpx', size: bytes.length }]);
    expect(message.artifact?.[TASK_RESULT_ARTIFACT]).toMatchObject({
      resultId: 'result-1',
      kind: 'report',
      file: { file_id: 'file-hwpx', filename: '정세분석팀 주간보고 초안.hwpx' },
    });
    expect(message.artifact?.[TASK_RESULT_ARTIFACT].notice).toBeUndefined();
    expect(env.saved[0]).toMatchObject({
      conversationId: 'convo-1',
      file: { file_id: 'file-hwpx' },
    });
    expect(env.renders[0].tables['금주 실적']).toEqual([
      { 담당: '김 사무관[^1]', 업무: '보고서 작성[^2]', 비고: 'kim.hwp' },
      { 담당: '이 주무관[^3]', 업무: '자료 수집[^4]', 비고: 'lee.hwpx' },
    ]);
  });

  it('keeps the report body and footnotes but no file when the converter is down', async () => {
    const env = setup(() => ({ ok: false, code: 'unavailable', message: 'ECONNREFUSED' }));
    const message = await call(TaskTools.write_report, { template_id: 'weekly-report' }, env.deps);
    const artifact = message.artifact?.[TASK_RESULT_ARTIFACT];
    expect(artifact?.notice).toBe(RENDER_UNAVAILABLE_NOTICE);
    expect(artifact?.file).toBeUndefined();
    expect(message.content).toContain(RENDER_UNAVAILABLE_NOTICE);
    expect(env.saved[0].kind).toBe('report');
    expect(env.saved[0]).not.toHaveProperty('file');
    expect((env.saved[0] as { footnotes: unknown[] }).footnotes).toHaveLength(4);
    expect(env.files).toHaveLength(0);
  });

  it('tells the user why rendering failed, not always that the server was unreachable', async () => {
    const notices: string[] = [];
    for (const code of ['unknown_template', 'invalid_request', 'render_failed']) {
      const env = setup(() => ({ ok: false, code, message: code }));
      const message = await call(
        TaskTools.write_report,
        { template_id: 'weekly-report' },
        env.deps,
      );
      const notice = message.artifact?.[TASK_RESULT_ARTIFACT].notice ?? '';
      expect(notice).not.toContain('연결하지 못해');
      expect(message.content).toContain(notice);
      expect(env.saved[0].kind).toBe('report');
      notices.push(notice);
    }
    expect(new Set([...notices, RENDER_UNAVAILABLE_NOTICE]).size).toBe(4);
  });

  it('reuses cells a previous table extracted, making only the writer call', async () => {
    const env = setup(() => ({ ok: true, buffer: Buffer.from('x'), filename: 'a.hwpx' }));
    await call(TaskTools.extract_table, { fields: ['담당', '금주 실적'] }, env.deps);
    const before = env.prompts.length;
    await call(TaskTools.write_report, { template_id: 'weekly-report' }, env.deps);
    expect(env.prompts.slice(before).map((prompt) => prompt.startsWith('You write'))).toEqual([
      true,
    ]);
  });
});

describe('extract_table tool', () => {
  it('returns a small artifact with counts and emits extraction progress per document', async () => {
    const env = setup(() => ({ ok: false, code: 'unavailable', message: '' }));
    const message = await call(TaskTools.extract_table, { fields: ['담당', '위험도'] }, env.deps);
    expect(message.artifact?.[TASK_RESULT_ARTIFACT]).toEqual({
      resultId: 'result-1',
      kind: 'table',
      title: '비교표 · 담당 · 위험도',
      stats: { docs: 2, reflected: 2, none: 1, low: 1, textOnly: 0, cached: 0, seconds: 0 },
    });
    expect(
      env.progress.filter((event) => event.stage === 'extract').map((event) => event.done),
    ).toEqual([0, 1, 2]);
    expect(env.progress.every((event) => event.toolCallId === 'call_1')).toBe(true);
    expect(message.content).toContain('- 위험도: 높음(1)');
  });

  it('tells the model to ask for uploads when the conversation has no documents', async () => {
    const env = setup(() => ({ ok: false, code: 'unavailable', message: '' }), []);
    const message = await call(TaskTools.extract_table, { fields: ['담당'] }, env.deps);
    expect(message.content).toContain(
      '문서가 없습니다. +로 파일을 올리면 전체 문서를 읽고 처리합니다.',
    );
    expect(message.artifact).toBeUndefined();
    expect(env.prompts).toHaveLength(0);
  });
});

describe('summarize_documents tool', () => {
  it('does not run without a chosen view', async () => {
    const env = setup(() => ({ ok: false, code: 'unavailable', message: '' }));
    const message = await call(
      TaskTools.summarize_documents,
      { views: ['간부 보고용', '위험 요인 중심'] },
      env.deps,
    );
    expect(message.content).toContain('요약 관점이 정해지지 않았습니다');
    expect(env.prompts).toHaveLength(0);
    expect(env.saved).toHaveLength(0);
  });
});
