import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dataService, PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TConversationTagsResponse } from 'librechat-data-provider';
import type { TAuthContext } from '~/common';
import { useConversationTagsQuery } from '../queries';
import { AuthContext } from '~/hooks/AuthContext';
import { useGetConversationTags } from '../tags';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

const tagResponse: TConversationTagsResponse = [
  {
    _id: 'tag-1',
    user: 'user-1',
    tag: 'work',
    count: 1,
    position: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const createWrapper = (canUseBookmarks: boolean) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth: TAuthContext = {
    user: { role: 'USER' } as NonNullable<TAuthContext['user']>,
    token: undefined,
    isAuthenticated: true,
    isAuthReady: true,
    error: undefined,
    login: () => undefined,
    logout: () => undefined,
    setError: () => undefined,
    roles: {
      USER: {
        permissions: {
          [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: canUseBookmarks },
        },
      } as NonNullable<NonNullable<TAuthContext['roles']>['USER']>,
    },
  };

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    );
  };
};

afterEach(() => jest.restoreAllMocks());

describe('conversation tag queries', () => {
  it('does not request tags without bookmark access when a caller enables the query', () => {
    const getConversationTags = jest
      .spyOn(dataService, 'getConversationTags')
      .mockResolvedValue(tagResponse);
    renderHook(() => useConversationTagsQuery({ enabled: true }), {
      wrapper: createWrapper(false),
    });

    expect(getConversationTags).not.toHaveBeenCalled();
  });

  it('requests tags when the user can use bookmarks', async () => {
    const getConversationTags = jest
      .spyOn(dataService, 'getConversationTags')
      .mockResolvedValue(tagResponse);
    const { result } = renderHook(() => useGetConversationTags(), {
      wrapper: createWrapper(true),
    });

    await waitFor(() => expect(getConversationTags).toHaveBeenCalledTimes(1));
    expect(result.current.data).toEqual(tagResponse);
  });
});
