import { useQuery } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type { QueryObserverResult } from '@tanstack/react-query';
import type { TaskResult } from 'librechat-data-provider';

/** Shared by the right panel and the result card in the message, so one fetch serves both. */
export const taskResultQueryKey = (resultId: string) => ['taskResult', resultId];

export const useTaskResultQuery = (
  resultId: string | null | undefined,
): QueryObserverResult<TaskResult> =>
  useQuery<TaskResult>(
    taskResultQueryKey(resultId ?? ''),
    () => dataService.getTaskResult(resultId ?? ''),
    {
      enabled: !!resultId,
      /** A result never changes after it is saved. */
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

/** Fetches the workbook with the session's auth and hands it to the browser as a file. */
export async function downloadTaskResultWorkbook(resultId: string, filename: string) {
  const response = await dataService.getTaskResultExport(resultId);
  saveBlob(response.data as Blob, filename);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
