import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult } from '@tanstack/react-query';
import type { TaskResult } from 'librechat-data-provider';

/** 오른쪽 패널과 메시지 결과 카드가 같은 query를 공유한다. */
export const taskResultQueryKey = (resultId: string) => [QueryKeys.taskResult, resultId];

/** hook과 단발 조회가 같은 query 설정을 사용한다. */
export const taskResultQuery = (resultId: string) => ({
  queryKey: taskResultQueryKey(resultId),
  queryFn: () => dataService.getTaskResult(resultId),
  /** 저장한 결과는 바뀌지 않으므로 자동 재요청을 막는다. */
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

export async function downloadTaskResultWorkbook(resultId: string, filename: string) {
  const response = await dataService.getTaskResultExport(resultId);
  saveBlob(response.data as Blob, filename);
}

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
