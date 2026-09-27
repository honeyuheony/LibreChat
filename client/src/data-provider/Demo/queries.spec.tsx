import { request } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDemoResetMutation } from './queries';

const createWrapper = (queryClient: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };

describe('useDemoResetMutation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts to the demo reset endpoint', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const post = jest.spyOn(request, 'post').mockResolvedValue({ rows: [] });
    const { result } = renderHook(() => useDemoResetMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/api\/demo\/reset$/), {});
    queryClient.clear();
  });
});
