import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
const mockStartupConfig = {
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

  it('shows the administrator demo entries in wireframe order with their glyphs', () => {
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

  it('opens each account-menu destination', () => {
    const destinations = [
      ['com_ui_schedules_title', '/schedules'],
      ['com_metrics_title', '/metrics'],
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
