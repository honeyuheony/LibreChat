import { dataService } from 'librechat-data-provider';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  TUpdateWorkspacePreferencesRequest,
  TUpdateWorkspacePreferencesResponse,
} from 'librechat-data-provider';
import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query';
import { workspacePreferencesQueryKey } from './queries';

export const useUpdateWorkspacePreferencesMutation = (
  options?: UseMutationOptions<
    TUpdateWorkspacePreferencesResponse,
    Error,
    TUpdateWorkspacePreferencesRequest
  >,
): UseMutationResult<
  TUpdateWorkspacePreferencesResponse,
  Error,
  TUpdateWorkspacePreferencesRequest
> => {
  const queryClient = useQueryClient();
  return useMutation<
    TUpdateWorkspacePreferencesResponse,
    Error,
    TUpdateWorkspacePreferencesRequest
  >(
    ['updateWorkspacePreferences'],
    (preferences) => dataService.updateWorkspacePreferences(preferences),
    {
      ...options,
      onSettled: (...args) => {
        void queryClient.invalidateQueries(workspacePreferencesQueryKey);
        options?.onSettled?.(...args);
      },
    },
  );
};
