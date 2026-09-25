import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

/** The signed-in user's desktop app as the desk relay sees it; refetched on focus so a newly started app shows up. */
export const useDeskStatusQuery = (
  config?: UseQueryOptions<t.DeskStatusResponse>,
): QueryObserverResult<t.DeskStatusResponse> => {
  return useQuery<t.DeskStatusResponse>([QueryKeys.deskStatus], () => dataService.getDeskStatus(), {
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    staleTime: 15 * 1000,
    retry: false,
    ...config,
  });
};
