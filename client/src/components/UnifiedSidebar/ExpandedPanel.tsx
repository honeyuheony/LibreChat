import { memo, useCallback, lazy, Suspense } from 'react';
import { useRecoilValue } from 'recoil';
import { Plus, Search } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Skeleton, Sidebar, Button, TooltipAnchor } from '@librechat/client';
import type { NavLink } from '~/common';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import { useActivePanel, resolveActivePanel, DEFAULT_PANEL } from '~/Providers';
import AgentMarketplaceButton from '~/components/Nav/AgentMarketplaceButton';
import { CLOSE_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import { DEFAULT_APP_TITLE } from '~/utils/documentTitle';
import SidePanelNav from '~/components/SidePanel/Nav';
import { useGetStartupConfig } from '~/data-provider';
import SearchBar from '~/components/Nav/SearchBar';
import BrandMark from '~/components/ui/BrandMark';
import useNewChat from '~/hooks/Chat/useNewChat';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

const SEARCH_INPUT_SELECTOR = 'input[data-testid="nav-search-input"]';

const rowClassName =
  'flex h-10 w-full items-center gap-2.5 rounded-theme-control px-2.5 text-[15px] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary';
const railButtonClassName =
  'flex size-9 items-center justify-center rounded-theme-control transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary';

/** A collapsed row keeps only its icon, so its label moves into a tooltip. */
function RowTooltip({
  expanded,
  label,
  children,
}: {
  expanded: boolean;
  label: string;
  children: JSX.Element;
}) {
  if (expanded) {
    return children;
  }
  return <TooltipAnchor side="right" description={label} render={children} />;
}

const NewChatRow = memo(function NewChatRow({
  expanded,
  setActive,
}: {
  expanded: boolean;
  setActive: (id: string) => void;
}) {
  const localize = useLocalize();
  const switchToHistory = useRecoilValue(store.newChatSwitchToHistory);
  const label = localize('com_ui_sidebar_new_chat');
  const tooltipDescription = useShortcutHint('newChat', label);
  const ariaKey = useShortcutAriaKey('newChat');

  const handlePanelSwitch = useCallback(() => {
    if (switchToHistory) {
      setActive(DEFAULT_PANEL);
    }
  }, [switchToHistory, setActive]);

  const { handleNewChatClick } = useNewChat({ onNewChat: handlePanelSwitch });

  return (
    <RowTooltip expanded={expanded} label={tooltipDescription}>
      <a
        href="/c/new"
        data-testid="new-chat-button"
        aria-label={label}
        aria-keyshortcuts={ariaKey}
        className={cn(
          expanded ? rowClassName : railButtonClassName,
          'font-semibold text-accent-primary',
        )}
        onClick={handleNewChatClick}
      >
        <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-submit text-white">
          <Plus className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
        </span>
        {expanded && <span className="truncate">{label}</span>}
      </a>
    </RowTooltip>
  );
});

/**
 * Expanded, the row is the search field itself. Collapsed, it opens the sidebar on the
 * conversation list and focuses that field once the slide has committed.
 */
const SearchRow = memo(function SearchRow({
  expanded,
  isConversationsActive,
  onShowConversations,
}: {
  expanded: boolean;
  isConversationsActive: boolean;
  onShowConversations: () => void;
}) {
  const localize = useLocalize();
  const { setSidebarOpen } = useSidebarToggle();
  const label = localize('com_ui_sidebar_search');

  const handleFocus = useCallback(() => {
    if (!isConversationsActive) {
      onShowConversations();
    }
  }, [isConversationsActive, onShowConversations]);

  const handleOpen = useCallback(() => {
    onShowConversations();
    setSidebarOpen(true, () => {
      setTimeout(() => document.querySelector<HTMLInputElement>(SEARCH_INPUT_SELECTOR)?.focus());
    });
  }, [onShowConversations, setSidebarOpen]);

  if (expanded) {
    return (
      <div className="flex" onFocusCapture={handleFocus}>
        <SearchBar />
      </div>
    );
  }

  return (
    <RowTooltip expanded={false} label={label}>
      <button
        type="button"
        aria-label={label}
        className={cn(railButtonClassName, 'text-text-secondary')}
        onClick={handleOpen}
      >
        <Search className="size-[18px]" aria-hidden="true" />
      </button>
    </RowTooltip>
  );
});

const NavRow = memo(function NavRow({
  link,
  isActive,
  expanded,
  section = false,
  setActive,
  onExpand,
  onNavigate,
  onLeaveInsights,
}: {
  link: NavLink;
  isActive: boolean;
  expanded: boolean;
  /** Drawn as the heading of the list below it rather than as a row. */
  section?: boolean;
  setActive: (id: string) => void;
  onExpand?: () => void;
  onNavigate?: () => void;
  onLeaveInsights?: () => void;
}) {
  const localize = useLocalize();
  const label = localize(link.title);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (link.onClick) {
        link.onClick(e);
        onNavigate?.();
        return;
      }
      if (!isActive) {
        setActive(link.id);
      }
      if (!expanded) {
        onExpand?.();
        return;
      }
      onLeaveInsights?.();
    },
    [link, isActive, setActive, expanded, onExpand, onNavigate, onLeaveInsights],
  );

  return (
    <RowTooltip expanded={expanded} label={label}>
      <Button
        variant="ghost"
        aria-label={label}
        aria-pressed={isActive}
        disabled={link.disabled}
        data-testid={`nav-panel-${link.id}`}
        className={cn(
          expanded ? cn(rowClassName, 'justify-start') : cn(railButtonClassName, 'px-0'),
          section && 'h-8 text-[13px] font-semibold text-text-secondary',
          !section &&
            (isActive
              ? 'bg-surface-active font-medium text-text-primary'
              : 'font-normal text-text-secondary'),
        )}
        onClick={handleClick}
      >
        {!section && <link.icon className="size-[18px] flex-shrink-0" aria-hidden="true" />}
        {expanded && <span className="truncate">{label}</span>}
        {expanded && link.trailing && (
          <span className="ml-auto text-xs font-normal text-text-tertiary">{link.trailing}</span>
        )}
      </Button>
    </RowTooltip>
  );
});

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

  /* The wireframe has no collapse button beside the brand; the sidebar shortcut still
     collapses it, and the rail above keeps the button that brings it back. */
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

/**
 * The whole desktop sidebar: brand, new chat, one row per page or panel, the conversation
 * history heading with its search field, the active panel, and the account menu.
 * Collapsed, the rows form an icon rail.
 */
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
  /** Expanded, the history list gets a heading of its own under the rows instead of a row. */
  const historyLink = expanded ? links.find((link) => link.id === DEFAULT_PANEL) : undefined;
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

      {historyLink && (
        <div className="mt-3 flex flex-col gap-0.5">
          <NavRow
            section
            link={historyLink}
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

      <div className={cn('pt-2', expanded ? 'w-full' : 'flex justify-center')}>
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
