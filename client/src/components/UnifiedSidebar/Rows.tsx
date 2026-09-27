import { memo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { Plus, Search } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button, TooltipAnchor } from '@librechat/client';
import type { NavLink } from '~/common';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import SearchBar from '~/components/Nav/SearchBar';
import useNewChat from '~/hooks/Chat/useNewChat';
import { DEFAULT_PANEL } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const SEARCH_INPUT_SELECTOR = 'input[data-testid="nav-search-input"]';

const rowClassName =
  'flex h-9 w-full items-center gap-2.5 rounded-theme-control px-2.5 text-[15px] transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary';
const railButtonClassName =
  'flex size-9 items-center justify-center rounded-theme-control transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary';

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

export const NewChatRow = memo(function NewChatRow({
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
  /** 새 대화 화면에서도 새 대화 항목을 활성 상태로 표시한다. */
  const isOnNewChat = useLocation().pathname === '/c/new';

  return (
    <RowTooltip expanded={expanded} label={tooltipDescription}>
      <a
        href="/c/new"
        data-testid="new-chat-button"
        aria-label={label}
        aria-keyshortcuts={ariaKey}
        aria-current={isOnNewChat ? 'page' : undefined}
        className={cn(
          expanded ? rowClassName : railButtonClassName,
          'font-semibold',
          isOnNewChat ? 'bg-surface-active text-text-primary' : 'text-accent-primary',
        )}
        onClick={handleNewChatClick}
      >
        <span
          className={cn(
            'flex size-5 flex-shrink-0 items-center justify-center rounded-full',
            isOnNewChat ? 'bg-surface-submit text-white' : 'bg-accent-primary/20',
          )}
        >
          <Plus className="size-3" strokeWidth={2.6} aria-hidden="true" />
        </span>
        {expanded && <span className="truncate">{label}</span>}
      </a>
    </RowTooltip>
  );
});

/** sidebar를 연 뒤 transition이 끝나야 검색창에 focus를 둘 수 있다. */
export const SearchRow = memo(function SearchRow({
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

export const NavRow = memo(function NavRow({
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
  /** 아래 목록의 제목으로 표시하고 항목으로 렌더링하지 않는다. */
  section?: boolean;
  setActive: (id: string) => void;
  onExpand?: () => void;
  onNavigate?: () => void;
  onLeaveInsights?: () => void;
}) {
  const localize = useLocalize();
  const label = localize(link.title);
  const badge = link.badge != null && link.badge > 0 ? link.badge : null;

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
        data-section={section || undefined}
        className={cn(
          expanded ? cn(rowClassName, 'justify-start') : cn(railButtonClassName, 'px-0'),
          section && 'h-8 px-2.5 text-[12.5px] font-normal text-text-muted',
          !section &&
            (isActive
              ? 'bg-surface-active font-normal text-text-primary'
              : 'font-normal text-text-secondary'),
        )}
        onClick={handleClick}
      >
        {!section &&
          (expanded && link.glyph ? (
            <span
              aria-hidden="true"
              className="w-4 flex-shrink-0 text-center font-mono text-[13px] text-text-muted"
            >
              {link.glyph}
            </span>
          ) : (
            <link.icon className="size-[18px] flex-shrink-0" aria-hidden="true" />
          ))}
        {expanded && <span className="truncate">{label}</span>}
        {expanded && link.sub && (
          <span className="whitespace-nowrap text-[11.5px] text-text-muted">{link.sub}</span>
        )}
        {expanded && link.trailing && (
          <span className="ml-auto text-[13px] font-normal tabular-nums text-text-muted">
            {link.trailing}
          </span>
        )}
        {expanded && badge != null && (
          <span
            className={cn(
              'rounded-full bg-amber-100 px-[7px] font-mono text-[11px] leading-[18px] text-amber-700',
              !link.trailing && 'ml-auto',
            )}
            aria-label={link.badgeLabel ? `${localize(link.badgeLabel)} ${badge}` : String(badge)}
          >
            {badge}
          </span>
        )}
      </Button>
    </RowTooltip>
  );
});
