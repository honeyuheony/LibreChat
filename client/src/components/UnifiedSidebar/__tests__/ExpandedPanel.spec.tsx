import React from 'react';
import { RecoilRoot } from 'recoil';
import '@testing-library/jest-dom/extend-expect';
import { MemoryRouter } from 'react-router-dom';
import { MessagesSquare, NotebookPen } from 'lucide-react';
import { render, fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MutableSnapshot } from 'recoil';
import type { SearchState } from '~/store/search';
import type { NavLink } from '~/common';
import { ActivePanelProvider, DEFAULT_PANEL } from '~/Providers';

const mockNewConversation = jest.fn();
const mockClearMessagesCache = jest.fn();

jest.mock('~/store', () => {
  const { atom } = jest.requireActual('recoil');
  let counter = 0;
  const switchAtom = atom({
    key: 'mock-newChatSwitchToHistory',
    default: true,
  });
  const customShortcutsAtom = atom({
    key: 'mock-customShortcuts',
    default: {},
  });
  const shortcutsEnabledAtom = atom({
    key: 'mock-shortcutsEnabled',
    default: true,
  });
  const searchAtom = atom({
    key: 'mock-search',
    default: { enabled: false, query: '', debouncedQuery: '', isSearching: false, isTyping: false },
  });
  return {
    __esModule: true,
    default: {
      conversationByIndex: () =>
        atom({ key: `mock-conversationByIndex-${counter++}`, default: null }),
      conversationIdByIndex: () =>
        atom({ key: `mock-conversationIdByIndex-${counter++}`, default: null }),
      newChatSwitchToHistory: switchAtom,
      customShortcuts: customShortcutsAtom,
      shortcutsEnabled: shortcutsEnabledAtom,
      search: searchAtom,
    },
  };
});

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useNewConvo: () => ({ newConversation: mockNewConversation }),
  useShowMarketplace: () => false,
}));

/**
 * Stands in for the real hook, which reaches `useNewConvo` by deep path and so
 * escapes the `~/hooks` mock above. Mirrors its contract closely enough that
 * the panel-switch assertions still exercise the `onNewChat` wiring.
 */
jest.mock('~/hooks/Chat/useNewChat', () => ({
  __esModule: true,
  default: ({ onNewChat }: { onNewChat?: () => void } = {}) => ({
    newConversation: mockNewConversation,
    startNewChat: () => {
      mockNewConversation();
      onNewChat?.();
    },
    handleNewChatClick: (event: React.MouseEvent<HTMLElement>) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      mockClearMessagesCache();
      mockNewConversation();
      onNewChat?.();
    },
  }),
}));

jest.mock('~/utils', () => ({
  clearMessagesCache: (...args: unknown[]) => mockClearMessagesCache(...args),
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  CLOSE_SIDEBAR_ID: 'close-sidebar',
}));

jest.mock('~/components/Nav/AccountSettings', () => ({
  __esModule: true,
  default: ({ collapsed }: { collapsed?: boolean }) => (
    <div data-testid="account-settings" data-collapsed={String(collapsed)} />
  ),
}));

jest.mock('~/components/Nav/SearchBar', () => ({
  __esModule: true,
  default: () => <input data-testid="nav-search-input" aria-label="search" />,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { appTitle: 'Work Agent' } }),
}));

const mockSetSidebarOpen = jest.fn();
jest.mock('~/hooks/Nav/useSidebarToggle', () => ({
  __esModule: true,
  default: () => ({ setSidebarOpen: mockSetSidebarOpen, toggleSidebar: jest.fn() }),
}));

import ExpandedPanel from '../ExpandedPanel';
import store from '~/store';

const createLinks = (): NavLink[] => [
  {
    title: 'com_ui_chat_history' as const,
    icon: MessagesSquare,
    id: DEFAULT_PANEL,
    Component: () => <div data-testid="history-panel" />,
  },
  {
    title: 'com_ui_prompts' as const,
    icon: NotebookPen,
    id: 'prompts',
  },
];

const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderPanel({
  expanded = true,
  links = createLinks(),
  onCollapse = jest.fn(),
  onExpand = jest.fn(),
  onNavigate,
  initialPanel = DEFAULT_PANEL,
  initializeState,
}: {
  expanded?: boolean;
  links?: NavLink[];
  onCollapse?: jest.Mock;
  onExpand?: jest.Mock;
  onNavigate?: jest.Mock;
  initialPanel?: string;
  initializeState?: (snapshot: MutableSnapshot) => void;
} = {}) {
  if (initialPanel !== DEFAULT_PANEL) {
    localStorage.setItem('side:active-panel', initialPanel);
  }

  const result = render(
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>
        <RecoilRoot initializeState={initializeState}>
          <ActivePanelProvider>
            <ExpandedPanel
              links={links}
              expanded={expanded}
              onCollapse={onCollapse}
              onExpand={onExpand}
              onNavigate={onNavigate}
            />
          </ActivePanelProvider>
        </RecoilRoot>
      </QueryClientProvider>
    </MemoryRouter>,
  );

  return { ...result, onCollapse, onExpand };
}

describe('ExpandedPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('panel rows', () => {
    it('keeps the sidebar open when the active row is clicked again', () => {
      const { onCollapse } = renderPanel({ expanded: true });
      const activeRow = screen.getByRole('button', { name: 'com_ui_chat_history' });
      fireEvent.click(activeRow);
      expect(onCollapse).not.toHaveBeenCalled();
      expect(activeRow).toHaveAttribute('aria-pressed', 'true');
    });

    it('switches panel when clicking an inactive row while expanded', () => {
      const { onCollapse } = renderPanel({ expanded: true });
      fireEvent.click(screen.getByRole('button', { name: 'com_ui_prompts' }));
      expect(onCollapse).not.toHaveBeenCalled();
      expect(localStorage.getItem('side:active-panel')).toBe('prompts');
      expect(screen.getByRole('button', { name: 'com_ui_prompts' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('expands the sidebar when clicking the active icon while collapsed', () => {
      const { onExpand } = renderPanel({ expanded: false });
      fireEvent.click(screen.getByRole('button', { name: 'com_ui_chat_history' }));
      expect(onExpand).toHaveBeenCalledTimes(1);
    });

    it('sets the active panel and expands when clicking an inactive icon while collapsed', () => {
      const { onExpand } = renderPanel({ expanded: false });
      fireEvent.click(screen.getByRole('button', { name: 'com_ui_prompts' }));
      expect(onExpand).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('side:active-panel')).toBe('prompts');
    });

    it('runs a link action and notifies navigation instead of switching panels', () => {
      const onClick = jest.fn();
      const onNavigate = jest.fn();
      const links = [
        ...createLinks(),
        {
          title: 'com_ui_sidebar_connectors' as const,
          icon: NotebookPen,
          id: 'connectors',
          onClick,
        },
      ];

      renderPanel({ links, onNavigate });
      fireEvent.click(screen.getByRole('button', { name: 'com_ui_sidebar_connectors' }));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('side:active-panel')).toBeNull();
    });

    it('labels each row with text while expanded', () => {
      renderPanel({ expanded: true });
      expect(screen.getByRole('button', { name: 'com_ui_prompts' })).toHaveTextContent(
        'com_ui_prompts',
      );
      expect(screen.getByTestId('new-chat-button')).toHaveTextContent('com_ui_sidebar_new_chat');
    });

    it('keeps only icons while collapsed', () => {
      renderPanel({ expanded: false });
      expect(screen.getByRole('button', { name: 'com_ui_prompts' })).toHaveTextContent('');
      expect(screen.getByTestId('new-chat-button')).toHaveTextContent('');
    });
  });

  describe('layout', () => {
    it('shows the app title and the active panel below the rows while expanded', () => {
      renderPanel({ expanded: true });
      expect(screen.getByText('Work Agent')).toBeInTheDocument();
      expect(screen.getByTestId('history-panel')).toBeInTheDocument();
      expect(screen.getByTestId('account-settings')).toHaveAttribute('data-collapsed', 'false');
    });

    it('drops the title and the panel while collapsed', () => {
      renderPanel({ expanded: false });
      expect(screen.queryByText('Work Agent')).not.toBeInTheDocument();
      expect(screen.queryByTestId('history-panel')).not.toBeInTheDocument();
      expect(screen.getByTestId('account-settings')).toHaveAttribute('data-collapsed', 'true');
    });
  });

  describe('search row', () => {
    const enableSearch = ({ set }: MutableSnapshot) => {
      set(store.search, (prev: SearchState) => ({ ...prev, enabled: true }));
    };

    it('is absent while the deployment has search turned off', () => {
      renderPanel({ expanded: true });
      expect(screen.queryByTestId('nav-search-input')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'com_ui_sidebar_search' }),
      ).not.toBeInTheDocument();
    });

    it('is the search field itself while expanded', () => {
      renderPanel({ expanded: true, initializeState: enableSearch });
      expect(screen.getByTestId('nav-search-input')).toBeInTheDocument();
    });

    it('switches to the conversation list when the field takes focus', () => {
      renderPanel({ expanded: true, initialPanel: 'prompts', initializeState: enableSearch });
      fireEvent.focus(screen.getByTestId('nav-search-input'));
      expect(localStorage.getItem('side:active-panel')).toBe(DEFAULT_PANEL);
    });

    it('opens the sidebar on the conversation list when clicked while collapsed', () => {
      renderPanel({ expanded: false, initialPanel: 'prompts', initializeState: enableSearch });
      fireEvent.click(screen.getByRole('button', { name: 'com_ui_sidebar_search' }));
      expect(mockSetSidebarOpen).toHaveBeenCalledTimes(1);
      expect(mockSetSidebarOpen.mock.calls[0][0]).toBe(true);
      expect(localStorage.getItem('side:active-panel')).toBe(DEFAULT_PANEL);
    });
  });

  describe('NewChatButton panel switch', () => {
    it('switches to chat history panel on new chat click when setting is enabled', () => {
      renderPanel({ expanded: true, initialPanel: 'prompts' });

      const newChatLink = screen.getByTestId('new-chat-button');
      fireEvent.click(newChatLink);

      expect(mockNewConversation).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('side:active-panel')).toBe(DEFAULT_PANEL);
    });

    it('does not switch panel on new chat click when setting is disabled', () => {
      renderPanel({
        expanded: true,
        initialPanel: 'prompts',
        initializeState: ({ set }: MutableSnapshot) => {
          set(store.newChatSwitchToHistory, false);
        },
      });

      const newChatLink = screen.getByTestId('new-chat-button');
      fireEvent.click(newChatLink);

      expect(mockNewConversation).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('side:active-panel')).toBe('prompts');
    });
  });
});
