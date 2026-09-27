import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { Constants, dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ParentSubagentIndex, SubagentThreadView } from 'librechat-data-provider';
import { useParentSubagentsQuery, useSubagentThreadQuery } from './queries';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

const parentIndex: ParentSubagentIndex = {
  parentConversationId: 'parent-conversation',
  children: [],
  childrenTruncated: false,
};
const threadView: SubagentThreadView = {
  threadId: 'thread-id',
  parentConversationId: 'parent-conversation',
  parentMessageId: 'parent-message',
  parentToolCallId: 'parent-tool-call',
  subagentType: 'agent-1',
  subagentKind: 'agent',
  title: 'Agent',
  status: 'completed',
  activity: [],
  activityTruncated: false,
  messages: [],
  historyTruncated: false,
};
const placeholderConversationIds = [
  '',
  String(Constants.NEW_CONVO),
  String(Constants.PENDING_CONVO),
];

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 0 } },
  });

  return function Wrapper({ children }: React.PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

afterEach(() => jest.restoreAllMocks());

describe('subagent query enabled guards', () => {
  it.each(placeholderConversationIds)(
    'does not request parent subagents for placeholder id %s when enabled is true',
    (conversationId) => {
      const getParentSubagents = jest
        .spyOn(dataService, 'getParentSubagents')
        .mockResolvedValue(parentIndex);

      renderHook(() => useParentSubagentsQuery(conversationId, { enabled: true }), {
        wrapper: createWrapper(),
      });

      expect(getParentSubagents).not.toHaveBeenCalled();
    },
  );

  it('requests parent subagents for a saved conversation', async () => {
    const getParentSubagents = jest
      .spyOn(dataService, 'getParentSubagents')
      .mockResolvedValue(parentIndex);
    const { result } = renderHook(
      () => useParentSubagentsQuery('parent-conversation', { enabled: true }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(getParentSubagents).toHaveBeenCalledWith('parent-conversation'));
    expect(result.current.data).toEqual(parentIndex);
  });

  it('does not request a thread when its parent id is missing and enabled is true', () => {
    const getSubagentThread = jest
      .spyOn(dataService, 'getSubagentThread')
      .mockResolvedValue(threadView);

    renderHook(() => useSubagentThreadQuery('', 'thread-id', 'task-id', { enabled: true }), {
      wrapper: createWrapper(),
    });

    expect(getSubagentThread).not.toHaveBeenCalled();
  });

  it('requests a thread when its parent and thread ids are present', async () => {
    const getSubagentThread = jest
      .spyOn(dataService, 'getSubagentThread')
      .mockResolvedValue(threadView);
    const { result } = renderHook(
      () =>
        useSubagentThreadQuery('parent-conversation', 'thread-id', 'task-id', { enabled: true }),
      { wrapper: createWrapper() },
    );

    await waitFor(() =>
      expect(getSubagentThread).toHaveBeenCalledWith('parent-conversation', 'thread-id', 'task-id'),
    );
    expect(result.current.data).toEqual(threadView);
  });
});
