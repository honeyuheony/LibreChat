import type { TTaskResultsResponse, TaskToolArguments } from './tasks';
import { TASK_PROGRESS_EVENT } from './tasks';
import { TaskTools } from './tools';

it('exports each task tool argument contract', () => {
  const argumentsByTool: TaskToolArguments = {
    extract_table: { fields: ['정세 전망'], suggested_fields: ['출처 매체'], file_ids: ['file-1'] },
    summarize_documents: { views: ['경제 영향'], view: '경제 영향', file_ids: ['file-1'] },
    write_report: { template_id: 'hwp-report', fields: ['정세 전망'], file_ids: ['file-1'] },
  };

  expect(Object.keys(argumentsByTool)).toEqual(Object.values(TaskTools));
});

it('exports the task tool names and progress event contract', () => {
  expect(Object.values(TaskTools)).toEqual([
    'extract_table',
    'summarize_documents',
    'write_report',
  ]);
  expect(TASK_PROGRESS_EVENT).toBe('on_task_progress');
});

it('exports the task results page contract', () => {
  const page: TTaskResultsResponse = {
    results: [
      {
        resultId: 'result-1',
        conversationId: 'conversation-1',
        conversationTitle: '주간 보고서',
        kind: 'report',
        title: '주간 보고서',
        fileName: 'weekly-report.hwpx',
        createdAt: '2026-09-27T00:00:00.000Z',
      },
    ],
    nextCursor: 'next-page',
  };

  expect(page.results).toHaveLength(1);
  expect(page.results[0]).toMatchObject({
    kind: 'report',
    fileName: 'weekly-report.hwpx',
  });
  expect(page.nextCursor).toBe('next-page');
});
