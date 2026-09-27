import { dataService } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  TUpdateWorkspacePreferencesResponse,
  TWorkspacePreferences,
} from 'librechat-data-provider';
import type { PropsWithChildren } from 'react';
import { useUpdateWorkspacePreferencesMutation, useWorkspacePreferencesQuery } from '../index';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

const savedPreferences: TWorkspacePreferences = {
  instructions: '모든 답변에 출처를 적습니다.',
  approvalMode: 'manual',
};
const changedPreferences: TWorkspacePreferences = {
  ...savedPreferences,
  approvalMode: 'auto',
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('workspace preference queries', () => {
  it('loads preferences and refreshes them after a partial update', async () => {
    const getPreferences = jest
      .spyOn(dataService, 'getWorkspacePreferences')
      .mockResolvedValueOnce(savedPreferences)
      .mockResolvedValue(changedPreferences);
    const updatePreferences = jest
      .spyOn(dataService, 'updateWorkspacePreferences')
      .mockResolvedValue({
        updated: true,
        preferences: changedPreferences,
      } satisfies TUpdateWorkspacePreferencesResponse);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(
      () => ({
        preferences: useWorkspacePreferencesQuery(),
        update: useUpdateWorkspacePreferencesMutation(),
      }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.preferences.data).toEqual(savedPreferences));
    act(() => result.current.update.mutate({ approvalMode: 'auto' }));
    await waitFor(() => expect(result.current.preferences.data).toEqual(changedPreferences));

    expect(getPreferences).toHaveBeenCalledTimes(2);
    expect(updatePreferences).toHaveBeenCalledWith({ approvalMode: 'auto' });
    queryClient.clear();
    getPreferences.mockRestore();
    updatePreferences.mockRestore();
  });
});
