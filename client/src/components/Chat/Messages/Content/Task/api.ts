import { apiBaseUrl, request } from 'librechat-data-provider';
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

/** Response of `GET /api/tasks/estimate` for the field confirmation card. */
export type TaskEstimate = {
  docs: number;
  minMinutes: number;
  maxMinutes: number;
  /** Documents whose every requested field is already in the extraction cache. */
  cached: number;
};

const tasksUrl = () => `${apiBaseUrl()}/api/tasks`;

export function fetchTaskResult(resultId: string): Promise<TaskResult> {
  return request.get(`${tasksUrl()}/results/${encodeURIComponent(resultId)}`);
}

export function fetchTaskEstimate(conversationId: string, fields: string[]): Promise<TaskEstimate> {
  const params = new URLSearchParams({ conversationId, kind: 'table' });
  for (const field of fields) {
    params.append('fields', field);
  }
  return request.get(`${tasksUrl()}/estimate?${params.toString()}`);
}

export async function fetchTaskExcel(resultId: string): Promise<Blob> {
  const response = await request.getResponse<Blob>(
    `${tasksUrl()}/results/${encodeURIComponent(resultId)}/export.xlsx`,
    { responseType: 'blob' },
  );
  return response.data;
}
