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

/**
 * The sidebar history's conversations request. The history heading reads the same
 * request for its count; identical parameters let react-query serve both from one fetch.
 */
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

/** The count beside the history heading: what the list holds, with `+` while pages remain. */
export function useSidebarConversationCount(): string | undefined {
  const { data } = useSidebarConversationsQuery();
  if (!data) {
    return undefined;
  }
  const count = data.pages.reduce((sum, page) => sum + page.conversations.length, 0);
  const hasMore = data.pages[data.pages.length - 1]?.nextCursor != null;
  return hasMore ? `${count}+` : String(count);
}

/**
 * The AgentHub wireframe's history: conversation names only. Projects, pins and the
 * filter menu are left out, and pinned chats sit in the list like any other.
 */
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

  /** The chats list is virtualized against this viewport rather than scrolling inside a
   *  pane of its own, so the sidebar scrolls as a single surface. */
  const [scrollViewport, setScrollViewport] = useState<HTMLDivElement | null>(null);
  const [scrollContent, setScrollContent] = useState<HTMLDivElement | null>(null);

  /** Searching replaces what the surface holds with results. A scroll position kept
   *  from the previous contents would open those results partway down whenever they
   *  are long enough for the browser not to clamp it, so the surface returns to the
   *  top whenever it changes what it is showing. */
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
      {/* The search field is not here: on desktop it is a row of the sidebar list above
          this panel, and on mobile it lives in the drawer's bottom bar, within thumb reach. */}
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
