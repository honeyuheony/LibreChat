import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult } from '@tanstack/react-query';
import type { TaskResult } from 'librechat-data-provider';

/** Shared by the right panel and the result card in the message, so one fetch serves both. */
export const taskResultQueryKey = (resultId: string) => [QueryKeys.taskResult, resultId];

/** Key, fetcher and freshness for one saved result, for hooks and one-off fetches alike. */
export const taskResultQuery = (resultId: string) => ({
  queryKey: taskResultQueryKey(resultId),
  queryFn: () => dataService.getTaskResult(resultId),
  /** A result never changes after it is saved. */
  staleTime: Infinity,
});

export const useTaskResultQuery = (
  resultId: string | null | undefined,
): QueryObserverResult<TaskResult> =>
  useQuery<TaskResult>({
    ...taskResultQuery(resultId ?? ''),
    enabled: !!resultId,
    refetchOnWindowFocus: false,
    retry: false,
  });

/** Fetches the workbook with the session's auth and hands it to the browser as a file. */
export async function downloadTaskResultWorkbook(resultId: string, filename: string) {
  const response = await dataService.getTaskResultExport(resultId);
  saveBlob(response.data as Blob, filename);
}

/** Fetches a report's HWPX file with the session's auth and saves it under its own name. */
export async function downloadTaskReportFile(
  userId: string,
  file: { file_id: string; filename: string },
) {
  const response = await dataService.getFileDownload(userId, file.file_id);
  saveBlob(response.data as Blob, file.filename);
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
