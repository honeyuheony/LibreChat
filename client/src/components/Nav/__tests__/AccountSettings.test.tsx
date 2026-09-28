import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TInterfaceConfig } from 'librechat-data-provider';
import AccountSettings from '../AccountSettings';

const mockLogout = jest.fn();
const mockShowToast = jest.fn();
const mockDemoResetMutation = { mutate: jest.fn(), isLoading: false };
type TDemoResetMutationOptions = {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
};
const mockDemoResetMutationOptions: { current: TDemoResetMutationOptions | undefined } = {
  current: undefined,
};
const mockDemoResetMutationHook = jest.fn((options?: TDemoResetMutationOptions) => {
  mockDemoResetMutationOptions.current = options;
  return mockDemoResetMutation;
});
let queryClient: QueryClient | undefined;
const mockAuthState = {
  current: {
    user: { id: 'admin-id', name: '홍길동', role: 'ADMIN' },
    isAuthenticated: true,
    logout: mockLogout,
  },
};
const mockSchedulesQuery = {
  current: { data: { schedules: [{ id: 'schedule-1' }] } },
};
const mockStartupConfig: {
  current: {
    balance: { enabled: boolean };
    interface: { schedules: TInterfaceConfig['schedules'] };
  };
} = {
  current: { balance: { enabled: false }, interface: { schedules: true } },
};
const mockSchedulePermission = { current: true };
const mockScheduleQueryHook = jest.fn(
  (_options: { enabled: boolean }) => mockSchedulesQuery.current,
);
const mockSwitchUserQuery: {
  current: {
    data: { target: { name: string; department: string } } | undefined;
    isSuccess: boolean;
  };
} = {
  current: {
    data: { target: { name: '이협력', department: '교류협력팀' } },
    isSuccess: true,
  },
};
const mockSwitchUserQueryHook = jest.fn(
  (_options: { enabled: boolean }) => mockSwitchUserQuery.current,
);
const mockSwitchUserMutation = { mutate: jest.fn(), isLoading: false };
const mockSwitchUserMutationHook = jest.fn(() => mockSwitchUserMutation);

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));
jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => mockAuthState.current,
}));
jest.mock('~/hooks', () => ({
  useHasAccess: () => mockSchedulePermission.current,
  useLocalize: () => (key: string) => key,
}));
jest.mock('~/data-provider', () => ({
  useGetFiles: () => ({ data: 12_288 }),
  useGetStartupConfig: () => ({ data: mockStartupConfig.current }),
}));
jest.mock('~/data-provider/Schedules', () => ({
  useSchedulesQuery: (options: { enabled: boolean }) => mockScheduleQueryHook(options),
}));
jest.mock('~/data-provider/Demo', () => ({
  useDemoSwitchUserQuery: (options: { enabled: boolean }) => mockSwitchUserQueryHook(options),
  useDemoSwitchUserMutation: () => mockSwitchUserMutationHook(),
  useDemoResetMutation: (options: TDemoResetMutationOptions) => mockDemoResetMutationHook(options),
}));
jest.mock('~/components/Chat/Input/Files/MyFilesModal', () => ({
  MyFilesModal: () => null,
}));

function AccountRouteProbe() {
  return <span data-testid="account-menu-route">{useLocation().pathname}</span>;
}

function renderAccountMenu(initialPath = '/') {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AccountSettings />
        <AccountRouteProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByTestId('nav-user'));
  return screen.getAllByRole('menuitem');
}

describe('account menu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.current = {
      user: { id: 'admin-id', name: '홍길동', role: 'ADMIN' },
      isAuthenticated: true,
      logout: mockLogout,
    };
    mockSchedulesQuery.current = { data: { schedules: [{ id: 'schedule-1' }] } };
    mockStartupConfig.current.interface.schedules = true;
    mockSchedulePermission.current = true;
    mockSwitchUserQuery.current = {
      data: { target: { name: '이협력', department: '교류협력팀' } },
      isSuccess: true,
    };
    mockScheduleQueryHook.mockClear();
    mockSwitchUserQueryHook.mockClear();
    mockSwitchUserMutation.mutate.mockClear();
    mockDemoResetMutation.mutate.mockClear();
    mockDemoResetMutationOptions.current = undefined;
    mockShowToast.mockClear();
    queryClient = undefined;
  });

  it('shows the administrator demo entries in menu order with their glyphs', () => {
    const items = renderAccountMenu();

    expect(items.map((item) => item.textContent?.trim())).toEqual([
      expect.stringContaining('com_nav_my_files'),
      expect.stringContaining('com_ui_schedules_title'),
      expect.stringContaining('com_metrics_title'),
      expect.stringContaining('com_nav_settings'),
      expect.stringContaining('com_ui_demo_switch_user'),
      expect.stringContaining('com_ui_demo_reset'),
      expect.stringContaining('com_nav_log_out'),
      expect.stringContaining('com_nav_desk_app'),
    ]);
    expect(items[0]).toHaveTextContent('▤');
    expect(items[1]).toHaveTextContent('◷');
    expect(items[2]).toHaveTextContent('▥');
    expect(items[3]).toHaveTextContent('⚙');
    expect(items[4]).toHaveTextContent('⇄');
    expect(items[5]).toHaveTextContent('↺');
    expect(items[6]).toHaveTextContent('↪');
    expect(items[7]).toHaveTextContent('▭');
    expect(items[0]).toHaveTextContent('12.0 KB');
    expect(items[1]).toHaveTextContent('1');
    expect(items[2]).toHaveTextContent('com_ui_admin');
    expect(items[3]).toHaveTextContent('com_ui_settings_hint');
    expect(items[4]).toHaveTextContent('이협력');
    expect(items.map((item) => item.textContent).join(' ')).not.toContain('com_nav_archived_chats');
  });

  it('uses the target account-menu surface dimensions and shadow', () => {
    renderAccountMenu();
    const menu = screen.getByRole('menu');

    expect(menu).toHaveStyle({
      borderRadius: 'var(--theme-surface-radius)',
      padding: 'var(--theme-space-compact)',
    });
    expect(menu.style.boxShadow).toBe('');
    expect(menu).toHaveClass(
      'shadow-[0_6px_16px_rgba(35,20,80,0.1)]',
      'dark:shadow-[0_10px_15px_-3px_rgba(0,0,0,0.25),0_4px_6px_-4px_rgba(0,0,0,0.1)]',
    );
  });

  it('uses 13px supporting values in the account menu', () => {
    const items = renderAccountMenu();

    items.slice(0, 5).forEach((item) => {
      expect(item.lastElementChild).toHaveClass('text-[13px]');
    });
  });

  it('shows schedule navigation when an object interface setting enables use', () => {
    mockStartupConfig.current.interface.schedules = { use: true, create: true };
    const items = renderAccountMenu();

    expect(items.map((item) => item.textContent).join(' ')).toContain('com_ui_schedules_title');
    expect(mockScheduleQueryHook).toHaveBeenCalledWith({ enabled: true });
  });

  it('opens each account-menu destination', () => {
    const destinations = [
      ['com_ui_schedules_title', '/schedules'],
      ['com_metrics_title', '/operations'],
      ['com_nav_settings', '/settings'],
    ];

    for (const [label, path] of destinations) {
      cleanup();
      renderAccountMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(label) }));
      expect(screen.getByTestId('account-menu-route')).toHaveTextContent(path);
    }
  });

  it('omits schedule navigation when the interface setting is off', () => {
    mockStartupConfig.current.interface.schedules = false;
    const items = renderAccountMenu();

    expect(items.map((item) => item.textContent).join(' ')).not.toContain('com_ui_schedules_title');
    expect(mockScheduleQueryHook).toHaveBeenCalledWith({ enabled: false });
  });

  it('omits schedule navigation without schedule permission', () => {
    mockSchedulePermission.current = false;
    const items = renderAccountMenu();

    expect(items.map((item) => item.textContent).join(' ')).not.toContain('com_ui_schedules_title');
    expect(mockScheduleQueryHook).toHaveBeenCalledWith({ enabled: false });
  });

  it('hides the demo switch item when the availability check fails', () => {
    mockSwitchUserQuery.current = { data: undefined, isSuccess: false };
    const items = renderAccountMenu();

    expect(items.map((item) => item.textContent).join(' ')).not.toContain(
      'com_ui_demo_switch_user',
    );
    expect(mockSwitchUserQueryHook).toHaveBeenCalledWith({ enabled: true });
  });

  it('does not show demo reset when the availability request was unsuccessful', () => {
    mockSwitchUserQuery.current = {
      data: { target: { name: '이협력', department: '교류협력팀' } },
      isSuccess: false,
    };
    const items = renderAccountMenu();

    expect(items.map((item) => item.textContent).join(' ')).not.toContain('com_ui_demo_reset');
  });

  it('hides demo reset from regular accounts even when demo switching is available', () => {
    mockAuthState.current.user = { id: 'user-id', name: '일반 사용자', role: 'USER' };
    const items = renderAccountMenu();

    expect(items.map((item) => item.textContent).join(' ')).not.toContain('com_ui_demo_reset');
  });

  it('closes the menu and shows a destructive reset confirmation', () => {
    renderAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /com_ui_demo_reset/ }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'com_ui_demo_reset_title' })).toBeInTheDocument();
    expect(screen.getByText('com_ui_demo_reset_confirmation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_demo_reset_action' })).toHaveClass(
      'bg-surface-destructive',
    );
  });

  it('matches the compact reset-confirmation dialog layout and focus', () => {
    renderAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /com_ui_demo_reset/ }));

    const dialog = screen.getByRole('dialog');
    const resetButton = screen.getByRole('button', { name: 'com_ui_demo_reset_action' });
    const cancelButton = screen.getByRole('button', { name: 'com_ui_cancel' });
    const overlay = document.querySelector('[class*="backdrop-blur"]');

    expect(dialog).toHaveClass('w-11/12', 'max-w-[440px]', 'min-h-[159px]');
    expect(dialog.children[0]).toHaveClass(
      'border-b',
      'border-border-light',
      'pt-[14px]',
      'pb-[14px]',
    );
    expect(dialog.children[1]).toHaveClass(
      'border-b',
      'border-border-light',
      'text-[14.5px]',
      'px-[18px]',
      'py-[14px]',
    );
    expect(dialog.children[2]).toHaveClass('bg-surface-secondary', 'px-[18px]', 'py-3');
    expect(screen.getByRole('heading', { name: 'com_ui_demo_reset_title' })).toHaveClass(
      'text-[16.5px]',
      'leading-[25px]',
    );
    expect(screen.getByRole('button', { name: 'com_ui_close' })).toBeInTheDocument();
    expect(overlay).toHaveClass(
      'backdrop-blur-[6px]',
      'bg-text-primary/40',
      '[@media(prefers-reduced-transparency:reduce)]:bg-text-primary/60',
    );
    expect(cancelButton).toHaveClass('hover:bg-surface-hover');
    expect(cancelButton).not.toHaveClass('border', 'border-border-light');
    expect(resetButton).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-ring-primary',
      'focus-visible:ring-offset-2',
      'focus-visible:ring-offset-surface-secondary',
    );
    expect(resetButton).toHaveClass(
      'focus:ring-2',
      'focus:ring-ring-primary',
      'focus:ring-offset-2',
      'focus:ring-offset-surface-secondary',
    );
    expect(resetButton).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'com_ui_demo_reset_title' })).toHaveClass(
      'font-bold',
    );
    expect(cancelButton).toHaveClass(
      'h-7',
      'text-[13px]',
      'font-normal',
      'rounded-theme-control-round',
    );
    expect(resetButton).toHaveClass(
      'h-[27px]',
      'min-w-[60px]',
      'text-[13px]',
      'font-normal',
      'rounded-theme-control-round',
    );
    expect(cancelButton).toHaveClass('text-text-tertiary');
  });

  it('uses 52px of vertical spacing for the reset confirmation footer', () => {
    renderAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /com_ui_demo_reset/ }));

    expect(screen.getByRole('dialog').children[2]).toHaveClass('px-[18px]', 'py-3');
  });

  it('does not request demo reset when the confirmation is cancelled', () => {
    renderAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /com_ui_demo_reset/ }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockDemoResetMutation.mutate).not.toHaveBeenCalled();
  });

  it('posts demo reset, notifies success, and refreshes app queries', () => {
    renderAccountMenu('/c/previous');
    fireEvent.click(screen.getByRole('menuitem', { name: /com_ui_demo_reset/ }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_demo_reset_action' }));

    expect(mockDemoResetMutation.mutate).toHaveBeenCalledTimes(1);
    act(() => mockDemoResetMutationOptions.current?.onSuccess?.());

    expect(mockShowToast).toHaveBeenCalledWith({
      message: 'com_ui_demo_reset_success',
      status: 'success',
    });
    expect(queryClient?.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('account-menu-route')).toHaveTextContent('/');
  });

  it('shows an error notification after reset fails with a conflict', () => {
    renderAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /com_ui_demo_reset/ }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_demo_reset_action' }));
    mockDemoResetMutationOptions.current?.onError?.(new Error('409 Conflict'));

    expect(mockShowToast).toHaveBeenCalledWith({
      message: 'com_ui_demo_reset_error',
      status: 'error',
    });
  });

  it('posts a switch request after selecting the other demo user', () => {
    renderAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /com_ui_demo_switch_user/ }));

    expect(mockSwitchUserMutation.mutate).toHaveBeenCalledTimes(1);
  });

  it('hides administrator and demo entries from a regular account', () => {
    mockAuthState.current.user = { id: 'user-id', name: '일반 사용자', role: 'USER' };
    mockSwitchUserQuery.current = { data: undefined, isSuccess: false };
    const items = renderAccountMenu();
    const labels = items.map((item) => item.textContent ?? '').join(' ');

    expect(labels).not.toContain('com_metrics_title');
    expect(labels).not.toContain('com_ui_demo_switch_user');
    expect(labels).not.toContain('com_nav_archived_chats');
  });
});
