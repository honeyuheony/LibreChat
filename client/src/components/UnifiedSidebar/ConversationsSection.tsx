import { useCallback, useEffect, useState, useMemo, memo, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import { useMediaQuery } from '@librechat/client';
import type { InfiniteQueryObserverResult } from '@tanstack/react-query';
import type { ConversationListResponse } from 'librechat-data-provider';
import type { List } from 'react-virtualized';
import {
  chatFilterTagsAtom,
  chatSortAtom,
  isArchivedChatViewAtom,
} from '~/components/Conversations/chatFilters';
import { useLocalize, useAuthContext, useLocalStorage, useNavScrolling } from '~/hooks';
import { useConversationsInfiniteQuery, useTitleGeneration } from '~/data-provider';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import { Conversations } from '~/components/Conversations';
import store from '~/store';

/** 대화 목록과 제목의 개수가 같은 query를 공유하도록 검색 조건을 맞춘다. */
export function useSidebarConversationsQuery() {
  const { isAuthenticated } = useAuthContext();
  const tags = useAtomValue(chatFilterTagsAtom);
  const sort = useAtomValue(chatSortAtom);
  const isArchivedView = useAtomValue(isArchivedChatViewAtom);
  const search = useRecoilValue(store.search);

  return useConversationsInfiniteQuery(
    {
      /** Omitted rather than `false`: the parameter's absence is what the server reads
       *  as "not archived", and a stray `isArchived=false` would key a third cache. */
      isArchived: isArchivedView ? true : undefined,
      sortBy: sort.field,
      sortDirection: sort.direction,
      tags: tags.length === 0 ? undefined : tags,
      search: search.debouncedQuery || undefined,
    },
    {
      enabled: isAuthenticated,
      staleTime: 30000,
      cacheTime: 300000,
    },
  );
}

/** 불러올 페이지가 더 있으면 현재 항목 수에 `+`를 붙인다. */
export function useSidebarConversationCount(): string | undefined {
  const { data } = useSidebarConversationsQuery();
  if (!data) {
    return undefined;
  }
  const count = data.pages.reduce((sum, page) => sum + page.conversations.length, 0);
  const hasMore = data.pages[data.pages.length - 1]?.nextCursor != null;
  return hasMore ? `${count}+` : String(count);
}

/** 대화 기록에는 이름만 보이고, 프로젝트·필터 없이 고정 대화도 일반 대화처럼 나열한다. */
const ConversationsSection = memo(() => {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { setSidebarOpen } = useSidebarToggle();
  const { isAuthenticated } = useAuthContext();
  useTitleGeneration(isAuthenticated);

  const [isChatsExpanded, setIsChatsExpanded] = useLocalStorage('chatsExpanded', true);

  const search = useRecoilValue(store.search);

  const {
    data,
    fetchNextPage,
    isFetchingNextPage,
    isLoading,
    isFetching,
    isPreviousData,
    isError,
    refetch,
  } = useSidebarConversationsQuery();

  const computedHasNextPage = useMemo(() => {
    if (data?.pages && data.pages.length > 0) {
      const lastPage: ConversationListResponse = data.pages[data.pages.length - 1];
      return lastPage.nextCursor !== null;
    }
    return false;
  }, [data?.pages]);

  const conversationsRef = useRef<List | null>(null);

  const { moveToTop } = useNavScrolling<ConversationListResponse>({
    fetchNextPage: async (options?) => {
      if (computedHasNextPage) {
        return fetchNextPage(options);
      }
      return Promise.resolve({} as InfiniteQueryObserverResult<ConversationListResponse, unknown>);
    },
    isFetchingNext: isFetchingNextPage,
  });

  const conversations = useMemo(() => {
    return data ? data.pages.flatMap((page) => page.conversations) : [];
  }, [data]);

  /**
   * Selecting a conversation is the most common close path — it must take
   * the animated route or the drawer stalls on the new conversation's
   * commit before it starts sliding. `afterSlide` carries that navigation:
   * run synchronously it would flush the conversation switch in the tap's
   * task and stall the slide anyway; deferred, it lands mid-slide. Desktop
   * runs it immediately (nothing slides).
   */
  const toggleNav = useCallback(
    (afterSlide?: () => void) => {
      if (isSmallScreen) {
        setSidebarOpen(false, afterSlide);
        return;
      }
      afterSlide?.();
    },
    [isSmallScreen, setSidebarOpen],
  );

  const loadMoreConversations = useCallback(() => {
    if (isFetchingNextPage || !computedHasNextPage) {
      return;
    }
    fetchNextPage();
  }, [isFetchingNextPage, computedHasNextPage, fetchNextPage]);

  const retryConversations = useCallback(() => {
    void refetch();
  }, [refetch]);

  const [isSearchLoading, setIsSearchLoading] = useState(
    !!search.query && (search.isTyping || isLoading || isFetching),
  );

  useEffect(() => {
    if (search.isTyping) {
      setIsSearchLoading(true);
    } else if (!isLoading && !isFetching) {
      setIsSearchLoading(false);
    } else if (!!search.query && (isLoading || isFetching)) {
      setIsSearchLoading(true);
    }
  }, [search.query, search.isTyping, isLoading, isFetching]);

  /** 목록을 이 viewport 기준으로 가상화해 사이드바 전체가 하나의 영역처럼 스크롤되게 한다. */
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null);
  const [scrollContent, setScrollContent] = useState<HTMLDivElement | null>(null);

  /** 검색 결과가 이전 스크롤 위치에서 시작하지 않도록 표시 내용이 바뀔 때 맨 위로 돌린다. */
  const isSearching = Boolean(search.query);
  useEffect(() => {
    if (scrollViewport) {
      scrollViewport.scrollTop = 0;
    }
  }, [isSearching, scrollViewport]);

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden pb-3"
      role="region"
      aria-label={localize('com_ui_chat_history')}
    >
      {/* 검색 입력은 desktop에서는 위쪽 sidebar 행에, mobile에서는 drawer 하단에 둔다. */}
      <div
        ref={setScrollViewport}
        className="scrollbar-gutter-stable min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        {/* `min-h-full` keeps the sections filling a tall sidebar, so the chats
            list still claims the space below them when there is little to show. */}
        <div ref={setScrollContent} className="flex min-h-full flex-col">
          <Conversations
            conversations={conversations}
            moveToTop={moveToTop}
            toggleNav={toggleNav}
            containerRef={conversationsRef}
            loadMoreConversations={loadMoreConversations}
            isLoading={isFetchingNextPage || isLoading}
            isSearchLoading={isSearchLoading || isPreviousData}
            isChatsExpanded={isChatsExpanded}
            setIsChatsExpanded={setIsChatsExpanded}
            hasNextPage={computedHasNextPage}
            isError={isError}
            onRetry={retryConversations}
            scrollViewport={scrollViewport}
            scrollContent={scrollContent}
            flat
          />
        </div>
      </div>
    </div>
  );
});

ConversationsSection.displayName = 'ConversationsSection';

export default ConversationsSection;
