import { useMemo } from 'react';
import type { TSkill, TSkillDraftOutput } from 'librechat-data-provider';
import type { QueryObserverResult } from '@tanstack/react-query';
import type { PeerExample } from './peers';
import { useGetSkillQuery, useSkillsInfiniteQuery } from '~/data-provider';
import { peerExample, pickPeers } from './peers';

/** 마켓 화면과 같은 목록 요청이라 편집기 뒤 마켓이 받아 둔 목록을 그대로 쓴다. */
const LIST_PARAMS = { limit: 100 };

function loadedExample(id: string | null, query: QueryObserverResult<TSkill>) {
  return id && query.data?._id === id ? peerExample(query.data) : null;
}

/**
 * 「다른 사람이 쓴 예 보기」를 연 동안만 목록에서 세 개를 골라 본문을 읽는다.
 * 읽는 중이면 undefined 다.
 */
export default function usePeers(
  open: boolean,
  output: TSkillDraftOutput,
  exclude: Array<string | undefined>,
): PeerExample[] | undefined {
  const list = useSkillsInfiniteQuery(LIST_PARAMS, { enabled: open });
  const excludeKey = exclude.filter(Boolean).join(',');
  const ids = useMemo(() => {
    if (!open) {
      return [null, null, null];
    }
    const skills = list.data?.pages.flatMap((page) => page.skills) ?? [];
    const picked = pickPeers(skills, output, new Set(excludeKey.split(',')));
    return [0, 1, 2].map((index) => picked[index]?._id ?? null);
  }, [open, list.data, output, excludeKey]);
  const first = useGetSkillQuery(ids[0]);
  const second = useGetSkillQuery(ids[1]);
  const third = useGetSkillQuery(ids[2]);

  const queries = [first, second, third];
  const loading =
    list.isLoading || queries.some((query, index) => ids[index] != null && query.isLoading);
  if (!open || loading) {
    return undefined;
  }
  return queries
    .map((query, index) => loadedExample(ids[index], query))
    .filter((example): example is PeerExample => example != null);
}
