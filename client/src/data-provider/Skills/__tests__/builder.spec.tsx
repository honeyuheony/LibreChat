import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TSkill, TSkillPack, TSkillPackSummary } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import {
  isSkillDraftRateLimited,
  useCreateSkillDraftMutation,
  useCreateSkillPackMutation,
  useDeleteSkillPackMutation,
  usePublishSkillMutation,
  useRecordSkillTestResultMutation,
} from '../mutations';
import { useGetSkillPackQuery, useListSkillPacksQuery } from '../queries';

const mockCreateSkillDraft = jest.fn();
const mockRecordSkillTestResult = jest.fn();
const mockPublishSkill = jest.fn();
const mockListSkillPacks = jest.fn();
const mockGetSkillPack = jest.fn();
const mockCreateSkillPack = jest.fn();
const mockDeleteSkillPack = jest.fn();

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      createSkillDraft: (...args: unknown[]) => mockCreateSkillDraft(...args),
      recordSkillTestResult: (...args: unknown[]) => mockRecordSkillTestResult(...args),
      publishSkill: (...args: unknown[]) => mockPublishSkill(...args),
      listSkillPacks: (...args: unknown[]) => mockListSkillPacks(...args),
      getSkillPack: (...args: unknown[]) => mockGetSkillPack(...args),
      createSkillPack: (...args: unknown[]) => mockCreateSkillPack(...args),
      deleteSkillPack: (...args: unknown[]) => mockDeleteSkillPack(...args),
    },
  };
});

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function makeSkill(id: string, version: number): TSkill {
  return {
    _id: id,
    name: `skill-${id}`,
    description: 'Skill description',
    body: '# Instructions',
    author: 'user-1',
    authorName: 'Test User',
    version,
    source: 'inline',
    fileCount: 0,
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:00:00.000Z',
  };
}

function makeSkillPack(id: string, skillIds?: string[]): TSkillPack {
  const pack: TSkillPack = {
    _id: id,
    name: `Pack ${id}`,
    slug: `pack-${id}`,
    description: 'Skill pack description',
    author: 'user-1',
    authorName: 'Test User',
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:00:00.000Z',
  };
  if (skillIds) {
    pack.skillIds = skillIds;
  }
  return pack;
}

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('skill builder mutations', () => {
  it('keeps a draft rate-limit response available to the editor', async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const rateLimitError = Object.assign(new Error('Too many draft requests'), {
      isAxiosError: true,
      response: { status: 429 },
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateSkillDraft.mockRejectedValue(rateLimitError);
    const { result } = renderHook(() => useCreateSkillDraftMutation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ text: '보고서를 작성한다' })).rejects.toBe(
        rateLimitError,
      );
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(isSkillDraftRateLimited(rateLimitError)).toBe(true);
    expect(isSkillDraftRateLimited(new Error('Other failure'))).toBe(false);
    queryClient.clear();
  });

  it('updates the skill cache and invalidates skill lists after recording a test', async () => {
    const queryClient = createQueryClient();
    const skillId = 'skill-1';
    const previousSkill = makeSkill(skillId, 2);
    const updatedSkill: TSkill = {
      ...previousSkill,
      lastTest: {
        version: 2,
        seconds: 4,
        conversationId: 'convo-1',
        at: '2026-09-27T00:01:00.000Z',
      },
    };
    const skillListKey = [QueryKeys.skills, 'infinite'];
    queryClient.setQueryData([QueryKeys.skill, skillId], previousSkill);
    queryClient.setQueryData(skillListKey, { pages: [], pageParams: [] });
    const cancelQueries = jest.spyOn(queryClient, 'cancelQueries');
    mockRecordSkillTestResult.mockResolvedValue(updatedSkill);
    const { result } = renderHook(() => useRecordSkillTestResultMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: skillId,
        payload: { conversationId: 'convo-1', version: 2 },
      });
    });

    expect(queryClient.getQueryData([QueryKeys.skill, skillId])).toEqual(updatedSkill);
    expect(cancelQueries).toHaveBeenCalledWith([QueryKeys.skill, skillId]);
    expect(queryClient.getQueryState(skillListKey)?.isInvalidated).toBe(true);
    queryClient.clear();
  });

  it('updates the skill cache and invalidates skill lists after publishing', async () => {
    const queryClient = createQueryClient();
    const skillId = 'skill-2';
    const previousSkill = makeSkill(skillId, 4);
    const updatedSkill: TSkill = {
      ...previousSkill,
      publishedAt: '2026-09-27T00:01:00.000Z',
    };
    const skillListKey = [QueryKeys.skills, 'infinite'];
    queryClient.setQueryData([QueryKeys.skill, skillId], previousSkill);
    queryClient.setQueryData(skillListKey, { pages: [], pageParams: [] });
    const cancelQueries = jest.spyOn(queryClient, 'cancelQueries');
    mockPublishSkill.mockResolvedValue(updatedSkill);
    const { result } = renderHook(() => usePublishSkillMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: skillId, payload: { scope: 'all' } });
    });

    expect(queryClient.getQueryData([QueryKeys.skill, skillId])).toEqual(updatedSkill);
    expect(cancelQueries).toHaveBeenCalledWith([QueryKeys.skill, skillId]);
    expect(queryClient.getQueryState(skillListKey)?.isInvalidated).toBe(true);
    queryClient.clear();
  });

  it('invalidates the skill pack list after creating a pack', async () => {
    const queryClient = createQueryClient();
    const packListKey = [QueryKeys.skills, 'packs'];
    queryClient.setQueryData(packListKey, [makeSkillPack('existing')]);
    mockCreateSkillPack.mockResolvedValue(makeSkillPack('new', ['skill-1', 'skill-2']));
    const { result } = renderHook(() => useCreateSkillPackMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        name: 'New pack',
        description: 'Two public skills',
        skillIds: ['skill-1', 'skill-2'],
      });
    });

    expect(queryClient.getQueryState(packListKey)?.isInvalidated).toBe(true);
    queryClient.clear();
  });

  it('invalidates the skill pack list and removes the deleted pack cache', async () => {
    const queryClient = createQueryClient();
    const packId = 'pack-1';
    const packListKey = [QueryKeys.skills, 'packs'];
    const packDetailKey = [QueryKeys.skills, 'packs', packId];
    queryClient.setQueryData(packListKey, [makeSkillPack(packId)]);
    queryClient.setQueryData(packDetailKey, makeSkillPack(packId, ['skill-1', 'skill-2']));
    mockDeleteSkillPack.mockResolvedValue({ deleted: true });
    const { result } = renderHook(() => useDeleteSkillPackMutation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: packId });
    });

    expect(queryClient.getQueryState(packListKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(packDetailKey)).toBeUndefined();
    queryClient.clear();
  });
});

describe('skill pack queries', () => {
  it('loads a pack list from the data service', async () => {
    const queryClient = createQueryClient();
    const packs: TSkillPackSummary[] = [makeSkillPack('pack-1'), makeSkillPack('pack-2')];
    mockListSkillPacks.mockResolvedValue(packs);
    const { result } = renderHook(() => useListSkillPacksQuery(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual(packs));
    expect(mockListSkillPacks).toHaveBeenCalledTimes(1);
    queryClient.clear();
  });

  it('loads a pack detail by id from the data service', async () => {
    const queryClient = createQueryClient();
    const pack = makeSkillPack('pack-1', ['skill-1', 'skill-2']);
    mockGetSkillPack.mockResolvedValue(pack);
    const { result } = renderHook(() => useGetSkillPackQuery('pack-1'), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual(pack));
    expect(mockGetSkillPack).toHaveBeenCalledWith('pack-1');
    queryClient.clear();
  });
});
