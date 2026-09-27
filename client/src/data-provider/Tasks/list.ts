import { dataService } from 'librechat-data-provider';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { TTaskResultsResponse } from 'librechat-data-provider';

const taskResultsQueryKey = ['taskResults'] as const;

/** 저장된 결과를 최신순으로 페이지당 50개 가져온다. */
export const useTaskResultsInfiniteQuery = () =>
  useInfiniteQuery<TTaskResultsResponse>({
    queryKey: taskResultsQueryKey,
    queryFn: ({ pageParam }) => dataService.getTaskResults(pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    refetchOnWindowFocus: false,
  });
