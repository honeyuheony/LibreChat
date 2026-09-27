import { dataService } from 'librechat-data-provider';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { TTaskResultsResponse } from 'librechat-data-provider';

export const taskResultsQueryKey = ['taskResults'] as const;

/** The signed-in user's saved results, newest first, 50 per page from the server. */
export const useTaskResultsInfiniteQuery = () =>
  useInfiniteQuery<TTaskResultsResponse>({
    queryKey: taskResultsQueryKey,
    queryFn: ({ pageParam }) => dataService.getTaskResults(pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    refetchOnWindowFocus: false,
  });
