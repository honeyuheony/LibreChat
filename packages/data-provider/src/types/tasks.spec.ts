import { TASK_PROGRESS_EVENT, type TaskToolArguments } from './tasks';
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
