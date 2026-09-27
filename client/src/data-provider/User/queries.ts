import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { TWorkspacePreferences } from 'librechat-data-provider';
import type { QueryObserverResult } from '@tanstack/react-query';

export const workspacePreferencesQueryKey = [QueryKeys.user, 'workspacePreferences'] as const;

export const useWorkspacePreferencesQuery = (): QueryObserverResult<TWorkspacePreferences> =>
  useQuery<TWorkspacePreferences>(
    workspacePreferencesQueryKey,
    () => dataService.getWorkspacePreferences(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  );
