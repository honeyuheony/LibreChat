import React from 'react';
import { RecoilRoot } from 'recoil';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider, useAtomValue } from 'jotai';
import { SettingsTabValues, dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { settingsDialogTabAtom } from '~/components/Nav/Settings/state';
import { getAgentServerNames } from '../useAgentConnectorSelection';
import ToolsMenu from '../ToolsMenu';

function SettingsTabReader() {
  const settingsTab = useAtomValue(settingsDialogTabAtom);
  return <span data-testid="settings-tab">{settingsTab ?? 'none'}</span>;
}

const render = (ui: React.ReactElement) =>
  rtlRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })}
    >
      <RecoilRoot>
        <JotaiProvider>{ui}</JotaiProvider>
      </RecoilRoot>
    </QueryClientProvider>,
  );

const mockToggleServerSelection = jest.fn();
const mockOnConfigClick = jest.fn();
const mockWebSearchChange = jest.fn();

const connectedStatus = { connectionState: 'connected', requiresOAuth: false };
const oauthPendingStatus = { connectionState: 'disconnected', requiresOAuth: true };

const defaultManager = {
  mcpValues: ['files'] as string[],
  selectableServers: [
    { serverName: 'files', config: { title: 'Shared files', description: 'Reads shared docs' } },
    { serverName: 'calendar', config: { title: 'Calendar', description: 'Reads events' } },
  ],
  connectionStatus: { files: connectedStatus, calendar: oauthPendingStatus } as Record<
    string,
    unknown
  >,
  getConfigDialogProps: () => null,
  toggleServerSelection: mockToggleServerSelection,
  getServerStatusIconProps: (serverName: string) => ({
    serverName,
    onConfigClick: mockOnConfigClick,
    hasCustomUserVars: false,
  }),
};

const toggle = (enabled: boolean, onChange = jest.fn()) => ({
  isToolEnabled: enabled,
  toggleState: enabled,
  debouncedChange: onChange,
  authData: { authTypes: [['key', 'system_defined']] },
});

let mockManager = { ...defaultManager };
let mockAgentTools: string[] | undefined;

jest.mock('~/hooks/Agents/useAgentToolPermissions', () => ({
  __esModule: true,
  default: () => ({ tools: mockAgentTools }),
}));
let mockContextTools: Record<string, unknown> = {};

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('~/hooks/MCP/useMCPRefresh', () => ({
  useMCPRefresh: () => undefined,
}));

jest.mock('~/Providers', () => ({
  useBadgeRowContext: () => ({
    conversationId: 'test-conv',
    storageContextKey: undefined,
    agentsConfig: null,
    mcpServerManager: mockManager,
    ...mockContextTools,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${values[0]}` : key,
  useHasAccess: () => true,
  useHasMemoryAccess: () => false,
  useAuthContext: () => ({ user: { personalization: {} } }),
  useAgentCapabilities: () => ({
    codeEnabled: false,
    memoryEnabled: false,
    webSearchEnabled: true,
    artifactsEnabled: false,
    fileSearchEnabled: false,
    skillsEnabled: false,
  }),
}));

jest.mock('@librechat/client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    TooltipAnchor: ({
      children,
      render,
    }: {
      children: React.ReactNode;
      render: React.ReactElement;
    }) => R.cloneElement(render, {}, ...(Array.isArray(children) ? children : [children])),
    MCPIcon: ({ className }: { className?: string }) => R.createElement('span', { className }),
    VectorIcon: ({ className }: { className?: string }) => R.createElement('span', { className }),
  };
});

jest.mock('~/components/MCP/MCPConfigDialog', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('~/components/ui/CustomIcon', () => ({
  __esModule: true,
  default: () => null,
}));

describe('ToolsMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockManager = { ...defaultManager };
    mockContextTools = { webSearch: toggle(true, mockWebSearchChange) };
    mockAgentTools = undefined;
    localStorage.clear();
  });

  it('counts the selected connectors and enabled built-in tools on the trigger', () => {
    render(<ToolsMenu showBuiltinTools={true} />);

    expect(screen.getByTestId('tools-menu-count')).toHaveTextContent('2');
    expect(
      screen.getByRole('button', { name: 'com_ui_tools, com_ui_tools_enabled_count:2' }),
    ).toBeInTheDocument();
  });

  it('lists connectors and built-in tools in one menu', async () => {
    const user = userEvent.setup();
    render(<ToolsMenu showBuiltinTools={true} />);

    await user.click(screen.getByTestId('tools-menu-button'));

    const menu = screen.getByRole('menu', { name: 'com_ui_tools' });
    const files = within(menu).getByRole('menuitemcheckbox', { name: 'Shared files' });
    expect(files).toHaveAttribute('aria-checked', 'true');
    expect(within(files).getByText('Reads shared docs')).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitemcheckbox', { name: 'com_ui_web_search' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('toggles a connector without closing the menu', async () => {
    const user = userEvent.setup();
    render(<ToolsMenu showBuiltinTools={true} />);

    await user.click(screen.getByTestId('tools-menu-button'));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Shared files' }));

    expect(mockToggleServerSelection).toHaveBeenCalledTimes(1);
    expect(mockToggleServerSelection).toHaveBeenCalledWith('files');
    expect(screen.getByRole('menu', { name: 'com_ui_tools' })).toBeVisible();
  });

  it('opens connector settings for a connector that needs a connection', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ToolsMenu showBuiltinTools={true} />
        <SettingsTabReader />
      </>,
    );

    await user.click(screen.getByTestId('tools-menu-button'));
    const calendar = screen.getByRole('menuitemcheckbox', {
      name: 'Calendar, com_ui_connection_required',
    });
    expect(within(calendar).queryByTestId('tools-menu-switch')).not.toBeInTheDocument();

    await user.click(within(calendar).getByTestId('tools-menu-connect'));

    expect(screen.getByTestId('settings-tab')).toHaveTextContent(SettingsTabValues.CONNECTORS);
    expect(screen.getByTestId('tools-menu-button')).toHaveAttribute('aria-expanded', 'false');
    expect(mockOnConfigClick).not.toHaveBeenCalled();
    expect(mockToggleServerSelection).not.toHaveBeenCalled();
  });

  describe('with the 「내 PC 폴더」 connector', () => {
    const deskStatus = (state: 'online' | 'offline') => ({
      state,
      deviceName: null,
      folderName: null,
      connectedAt: null,
      installerUrl: 'https://relay.example/app/desk-app-setup-0.1.2.exe',
    });

    beforeEach(() => {
      mockManager = {
        ...defaultManager,
        selectableServers: [
          { serverName: 'my-pc', config: { title: 'My PC folder', description: 'Reads a folder' } },
        ],
        connectionStatus: { 'my-pc': connectedStatus },
      };
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('says the PC app is off and opens the download page from the row', async () => {
      jest.spyOn(dataService, 'getDeskStatus').mockResolvedValue(deskStatus('offline'));
      const openWindow = jest.spyOn(window, 'open').mockReturnValue(null);
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      const row = screen.getByRole('menuitemcheckbox', { name: 'My PC folder' });
      expect(await within(row).findByText('com_ui_tools_desk_app_off')).toBeInTheDocument();
      expect(within(row).queryByText('Reads a folder')).not.toBeInTheDocument();

      await user.click(within(row).getByTestId('tools-menu-desk-download'));

      expect(openWindow).toHaveBeenCalledTimes(1);
      expect(openWindow).toHaveBeenCalledWith('/download', '_blank', 'noopener,noreferrer');
      expect(mockToggleServerSelection).not.toHaveBeenCalled();
    });

    it('keeps the plain description while the PC app is on', async () => {
      const getDeskStatus = jest
        .spyOn(dataService, 'getDeskStatus')
        .mockResolvedValue(deskStatus('online'));
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      const row = screen.getByRole('menuitemcheckbox', { name: 'My PC folder' });

      await waitFor(() => expect(getDeskStatus).toHaveBeenCalledTimes(1));
      await act(async () => {
        await getDeskStatus.mock.results[0].value;
      });
      expect(within(row).getByText('Reads a folder')).toBeInTheDocument();
      expect(within(row).queryByTestId('tools-menu-desk-download')).not.toBeInTheDocument();
    });
  });

  it('flips a built-in tool through its toggle', async () => {
    const user = userEvent.setup();
    render(<ToolsMenu showBuiltinTools={true} />);

    await user.click(screen.getByTestId('tools-menu-button'));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'com_ui_web_search' }));

    expect(mockWebSearchChange).toHaveBeenCalledWith({ value: false });
  });

  it('leaves built-in tools out where they do not reach the model', async () => {
    const user = userEvent.setup();
    render(<ToolsMenu showBuiltinTools={false} />);

    expect(screen.getByTestId('tools-menu-count')).toHaveTextContent('1');
    await user.click(screen.getByTestId('tools-menu-button'));
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'com_ui_web_search' }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing when there is no connector or tool to offer', () => {
    mockManager = { ...defaultManager, selectableServers: [], mcpValues: [] };
    const { container } = render(<ToolsMenu showBuiltinTools={false} />);

    expect(container.firstChild).toBeNull();
  });

  it('hides the count when nothing is turned on', () => {
    mockManager = { ...defaultManager, mcpValues: [] };
    mockContextTools = { webSearch: toggle(false) };
    render(<ToolsMenu showBuiltinTools={true} />);

    expect(screen.queryByTestId('tools-menu-count')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_tools' })).toBeInTheDocument();
  });

  describe('on a saved agent', () => {
    const savedAgent = 'agent_saved';

    beforeEach(() => {
      mockManager = { ...defaultManager, mcpValues: [] };
      mockAgentTools = ['web_search', 'read_mcp_files', 'list_mcp_files'];
    });

    it('shows every connector the agent carries as on until the chat switches one off', async () => {
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);

      expect(screen.getByTestId('tools-menu-count')).toHaveTextContent('1');
      await user.click(screen.getByTestId('tools-menu-button'));
      expect(screen.getByRole('menuitemcheckbox', { name: 'Shared files' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    it('lists a connector the agent does not carry as unavailable, without a switch', async () => {
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      const calendar = screen.getByTestId('tools-menu-unavailable');
      expect(calendar).toHaveAccessibleName('Calendar, com_ui_connector_unavailable_for_agent');
      expect(calendar).toHaveAttribute('aria-disabled', 'true');
      expect(screen.queryByRole('menuitemcheckbox', { name: /Calendar/ })).not.toBeInTheDocument();
    });

    it('records a switched-off connector for the server instead of the chat selection', async () => {
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      await user.click(screen.getByRole('menuitemcheckbox', { name: 'Shared files' }));

      expect(screen.getByRole('menuitemcheckbox', { name: 'Shared files' })).toHaveAttribute(
        'aria-checked',
        'false',
      );
      expect(screen.queryByTestId('tools-menu-count')).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem('LAST_MCP_DISABLED_test-conv') ?? 'null')).toEqual([
        'files',
      ]);
      expect(mockToggleServerSelection).not.toHaveBeenCalled();
    });

    it('lays a stored choice back on when the conversation is opened again', async () => {
      localStorage.setItem('LAST_MCP_DISABLED_test-conv', JSON.stringify(['files']));
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      expect(
        await screen.findByRole('menuitemcheckbox', { name: 'Shared files', checked: false }),
      ).toBeInTheDocument();
    });
  });
});

describe('getAgentServerNames', () => {
  it('reads the connectors from the agent MCP tool keys, resolving delimiter-bearing names', () => {
    const tools = ['web_search', 'run_mcp_foo_mcp_bar', 'sys__all__sys_mcp_docs', 'x_mcp_gone'];

    expect(getAgentServerNames(tools, ['bar', 'foo_mcp_bar', 'docs'])).toEqual(
      new Set(['foo_mcp_bar', 'docs']),
    );
  });
});
