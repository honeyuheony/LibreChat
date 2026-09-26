import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ActiveJobsResponse } from '../queries';
import { useSubmitToolApprovalMutation } from '../mutations';
import { selectActiveJobStatus } from '../queries';

jest.mock('../protocol', () => ({
  ...jest.requireActual('../protocol'),
  postGenerationRequest: jest.fn().mockResolvedValue({ success: true }),
}));

const renderWithClient = (initial: ActiveJobsResponse) => {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  queryClient.setQueryData([QueryKeys.activeJobs], initial);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useSubmitToolApprovalMutation(), { wrapper });
  return { result, queryClient };
};

describe('useSubmitToolApprovalMutation', () => {
  it('shows the paused run as running again once the decision is accepted', async () => {
    const { result, queryClient } = renderWithClient({
      activeJobIds: ['convo-1', 'convo-2'],
      jobs: [
        { id: 'convo-1', status: 'requires_action' },
        { id: 'convo-2', status: 'requires_action' },
      ],
    });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'convo-1',
        generationCreatedAt: 1,
        actionId: 'action-1',
        decisions: [{ tool_call_id: 'call-1', decision: 'approve' }],
      });
    });

    const cache = queryClient.getQueryData<ActiveJobsResponse>([QueryKeys.activeJobs]);
    expect(selectActiveJobStatus(cache, 'convo-1')).toBe('running');
    expect(selectActiveJobStatus(cache, 'convo-2')).toBe('requires_action');
  });

  it('does not list a run the cache no longer holds', async () => {
    const { result, queryClient } = renderWithClient({ activeJobIds: [], jobs: [] });

    await act(async () => {
      await result.current.mutateAsync({
        conversationId: 'convo-1',
        generationCreatedAt: 1,
        actionId: 'action-1',
        decisions: [{ tool_call_id: 'call-1', decision: 'reject' }],
      });
    });

    const cache = queryClient.getQueryData<ActiveJobsResponse>([QueryKeys.activeJobs]);
    expect(cache?.activeJobIds).toEqual([]);
  });
});
