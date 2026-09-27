import { memo, useCallback, useMemo, lazy, Suspense } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocation } from 'react-router-dom';
import { Skeleton, Sidebar, Button, TooltipAnchor } from '@librechat/client';
import type { NavLink } from '~/common';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import { useActivePanel, resolveActivePanel, DEFAULT_PANEL } from '~/Providers';
import AgentMarketplaceButton from '~/components/Nav/AgentMarketplaceButton';
import { CLOSE_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';
import { useSidebarConversationCount } from './ConversationsSection';
import { DEFAULT_APP_TITLE } from '~/utils/documentTitle';
import { NavRow, NewChatRow, SearchRow } from './Rows';
import SidePanelNav from '~/components/SidePanel/Nav';
import { useGetStartupConfig } from '~/data-provider';
import BrandMark from '~/components/ui/BrandMark';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

function BrandHeader({
  expanded,
  onCollapse,
  onExpand,
}: {
  expanded: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
}) {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const toggleLabel = expanded ? 'com_nav_close_sidebar' : 'com_nav_open_sidebar';
  const toggleSidebarHint = useShortcutHint('toggleSidebar', localize(toggleLabel));
  const toggleSidebarAriaKey = useShortcutAriaKey('toggleSidebar');

  const toggle = (
    <TooltipAnchor
      side={expanded ? 'bottom' : 'right'}
      description={toggleSidebarHint}
      render={
        <Button
          id={expanded ? CLOSE_SIDEBAR_ID : undefined}
          data-testid={expanded ? 'close-sidebar-button' : 'open-sidebar-button'}
          size="icon"
          variant="ghost"
          aria-label={localize(toggleLabel)}
          aria-expanded={expanded}
          aria-keyshortcuts={toggleSidebarAriaKey}
          className="size-9 flex-shrink-0 rounded-theme-control text-text-tertiary"
          onClick={expanded ? onCollapse : onExpand}
        >
          <Sidebar aria-hidden="true" className="size-[18px]" />
        </Button>
      }
    />
  );

  if (!expanded) {
    return <div className="flex flex-col items-center gap-1 pb-2">{toggle}</div>;
  }

  // 축소 버튼은 브랜드 옆에 두지 않고 아이콘 레일에 남겨 다시 펼칠 수 있게 한다.
  return (
    <div className="flex items-center justify-between gap-2 pb-3 pl-2 pt-1">
      <div className="flex min-w-0 items-center gap-2">
        <BrandMark className="size-[26px]" />
        <span className="truncate text-lg font-bold tracking-[-0.02em] text-text-primary">
          {startupConfig?.appTitle || DEFAULT_APP_TITLE}
        </span>
      </div>
      <AgentMarketplaceButton />
    </div>
  );
}

function ExpandedPanel({
  links,
  expanded = true,
  onCollapse,
  onExpand,
  onNavigate,
  onLeaveInsights,
}: {
  links: NavLink[];
  expanded?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
  onNavigate?: () => void;
  onLeaveInsights?: () => void;
}) {
  const location = useLocation();
  const search = useRecoilValue(store.search);
  const { active, setActive } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);
  const isInsightsRoute = location.pathname.startsWith('/insights');

  const showConversations = useCallback(() => {
    setActive(DEFAULT_PANEL);
    if (isInsightsRoute) {
      onLeaveInsights?.();
    }
  }, [setActive, isInsightsRoute, onLeaveInsights]);

  const isLinkActive = (link: NavLink) => {
    if (link.activePath) {
      return location.pathname.startsWith(link.activePath);
    }
    if (link.id === 'insights') {
      return isInsightsRoute;
    }
    return !isInsightsRoute && link.id === effectiveActive;
  };
  /** 열린 sidebar에서는 대화 기록을 메뉴 항목 대신 목록 제목으로 표시한다. */
  const historyLink = expanded ? links.find((link) => link.id === DEFAULT_PANEL) : undefined;
  const conversationCount = useSidebarConversationCount();
  const historyHeading = useMemo(
    () => (historyLink ? { ...historyLink, trailing: conversationCount } : undefined),
    [historyLink, conversationCount],
  );
  const rowLinks = historyLink ? links.filter((link) => link !== historyLink) : links;
  const searchRow = search.enabled === true && (
    <SearchRow
      expanded={expanded}
      isConversationsActive={!isInsightsRoute && effectiveActive === DEFAULT_PANEL}
      onShowConversations={showConversations}
    />
  );

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col border-r border-border-light bg-surface-primary-alt px-2 py-3',
        !expanded && 'items-center',
      )}
    >
      <BrandHeader expanded={expanded} onCollapse={onCollapse} onExpand={onExpand} />
      <div className={cn('flex flex-col gap-0.5', !expanded && 'items-center')}>
        <NewChatRow expanded={expanded} setActive={setActive} />
        {expanded ? (
          <div role="separator" className="mx-2.5 my-1.5 border-t border-border-light" />
        ) : (
          searchRow
        )}
        {rowLinks.map((link) => (
          <NavRow
            key={link.id}
            link={link}
            isActive={isLinkActive(link)}
            expanded={expanded}
            setActive={setActive}
            onExpand={onExpand}
            onNavigate={onNavigate}
            onLeaveInsights={isInsightsRoute ? onLeaveInsights : undefined}
          />
        ))}
      </div>

      {historyLink && historyHeading && (
        <div className="mt-3 flex flex-col gap-0.5">
          <NavRow
            section
            link={historyHeading}
            isActive={isLinkActive(historyLink)}
            expanded={expanded}
            setActive={setActive}
            onLeaveInsights={isInsightsRoute ? onLeaveInsights : undefined}
          />
          {searchRow}
        </div>
      )}
      {expanded ? (
        <nav className="-mx-2 mt-1 min-h-0 flex-1 overflow-hidden">
          <SidePanelNav links={links} />
        </nav>
      ) : (
        <div className="flex-1" />
      )}

      <div
        className={cn(
          'pt-2',
          expanded
            ? '-mx-2 w-auto border-t border-border-light px-3 pt-2.5'
            : 'flex justify-center',
        )}
      >
        <Suspense
          fallback={
            <Skeleton className={cn('rounded-theme-control', expanded ? 'h-14' : 'size-9')} />
          }
        >
          <AccountSettings collapsed={!expanded} />
        </Suspense>
      </div>
    </div>
  );
}

export default memo(ExpandedPanel);
