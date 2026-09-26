import type { TaskResult, TaskStats } from 'librechat-data-provider';

/** Small `task_result` message attachment; rows and body stay in the result store. */
export type TaskResultAttachment = {
  resultId: string;
  kind: TaskResult['kind'];
  title: string;
  stats: TaskStats;
  file?: { file_id: string; filename: string };
  /** Set when the report body exists but the HWPX file could not be made. */
  notice?: string;
};
