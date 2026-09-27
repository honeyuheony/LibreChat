import { dataService } from 'librechat-data-provider';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  QueryObserverResult,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
} from '@tanstack/react-query';

type TDemoSwitchUserResponse = Awaited<ReturnType<typeof dataService.getDemoSwitchUser>>;
type TDemoSwitchUserMutationResponse = Awaited<ReturnType<typeof dataService.switchDemoUser>>;

const demoSwitchUserQueryKey = ['demo', 'switch-user'] as const;

export function useDemoSwitchUserQuery(
  config?: UseQueryOptions<TDemoSwitchUserResponse, Error>,
): QueryObserverResult<TDemoSwitchUserResponse, Error> {
  return useQuery<TDemoSwitchUserResponse, Error>(
    demoSwitchUserQueryKey,
    () => dataService.getDemoSwitchUser(),
    { retry: false, ...config },
  );
}

export function useDemoSwitchUserMutation(
  config?: UseMutationOptions<TDemoSwitchUserMutationResponse, Error, void>,
): UseMutationResult<TDemoSwitchUserMutationResponse, Error, void> {
  return useMutation<TDemoSwitchUserMutationResponse, Error, void>(
    () => dataService.switchDemoUser(),
    config,
  );
}
