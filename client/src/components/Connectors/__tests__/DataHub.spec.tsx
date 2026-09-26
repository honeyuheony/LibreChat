import React from 'react';
import { RecoilRoot } from 'recoil';
import '@testing-library/jest-dom/extend-expect';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, within } from '@testing-library/react';
import type { ConnectorActivityItem, DeskStatusResponse } from 'librechat-data-provider';
import type { MCPServerDefinition } from '~/hooks';
import DataHub from '../Hub/DataHub';

const mockStartNewChat = jest.fn();
const mockInitializeServer = jest.fn();
const mockRevokeOAuth = jest.fn();
const mockTools: { current: Record<string, { tools: object[] }> } = { current: {} };
const mockServers: { current: MCPServerDefinition[] } = { current: [] };
const mockStatuses: { current: Record<string, object | undefined> } = { current: {} };
const mockDesk: { current: DeskStatusResponse | undefined } = { current: undefined };
const mockActivity: { current: ConnectorActivityItem[] } = { current: [] };
const mockRole = { current: 'USER' };
/** Servers whose sign-in this browser started, as the manager's own `isInitializing` reports. */
const mockStartedHere: { current: Set<string> } = { current: new Set() };

jest.mock('~/hooks', () => {
  const english = jest.requireActual<Record<string, string>>('~/locales/en/translation.json');
  const localize = (key: string, params?: Record<string, string>) =>
    Object.entries(params ?? {}).reduce(
      (text, [name, value]) => text.replace(`{{${name}}}`, value),
      english[key] ?? key,
    );
  return {
    useLocalize: () => localize,
    useDocumentTitle: jest.fn(),
    activateCatalog: jest.fn(),
    useAuthContext: () => ({ user: { id: 'user-a', role: mockRole.current } }),
    useMCPServerManager: () => ({
      availableMCPServers: mockServers.current,
      isLoading: false,
      initializeServer: mockInitializeServer,
      isInitializing: (serverName: string) => mockStartedHere.current.has(serverName),
      revokeOAuthForServer: mockRevokeOAuth,
      getConfigDialogProps: () => null,
      getServerStatusIconProps: (serverName: string) => ({
        serverName,
        serverStatus: mockStatuses.current[serverName],
        isInitializing: mockStartedHere.current.has(serverName),
        canCancel: mockStartedHere.current.has(serverName),
        hasCustomUserVars: false,
        onConfigClick: jest.fn(),
        onCancel: jest.fn(),
      }),
    }),
  };
});

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useMediaQuery: () => false,
}));
jest.mock('~/hooks/MCP/useMCPRefresh', () => ({ useMCPRefresh: jest.fn() }));
jest.mock('~/hooks/Chat/useNewChat', () => () => ({ startNewChat: mockStartNewChat }));
jest.mock('~/components/MCP/MCPConfigDialog', () => () => null);
jest.mock('~/components/Chat/Menus/OpenSidebar', () => () => null);
jest.mock('~/data-provider/MCP/queries', () => ({
  useMCPToolsQuery: () => ({
    isLoading: false,
    isError: false,
    data: { servers: mockTools.current },
  }),
}));
jest.mock('~/data-provider/Connectors/queries', () => ({
  useDeskStatusQuery: () => ({ data: mockDesk.current, isError: false }),
  useConnectorActivityQuery: () => ({
    data: mockActivity.current,
    isLoading: false,
    isError: false,
  }),
}));

const server = (serverName: string, config: Partial<MCPServerDefinition['config']> = {}) =>
  ({
    serverName,
    effectivePermissions: 1,
    config: {
      type: 'streamable-http',
      url: `http://${serverName}/mcp`,
      title: serverName,
      ...config,
    },
  }) as MCPServerDefinition;

const connected = { connectionState: 'connected', requiresOAuth: false };

function renderHub(path = '/connectors') {
  return render(
    <RecoilRoot>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/connectors" element={<DataHub />} />
          <Route path="/connectors/:serverName" element={<DataHub />} />
        </Routes>
      </MemoryRouter>
    </RecoilRoot>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRole.current = 'USER';
  mockStartedHere.current = new Set();
  mockDesk.current = {
    state: 'offline',
    deviceName: null,
    folders: [],
    connectedAt: null,
    installerUrl: null,
  };
  mockActivity.current = [];
  mockTools.current = {
    'google-workspace': {
      tools: [
        { name: 'calendar_list_events', pluginKey: 'calendar_list_events_mcp_google-workspace' },
        { name: 'calendar_create_event', pluginKey: 'calendar_create_event_mcp_google-workspace' },
      ],
    },
  };
  mockServers.current = [
    server('filesystem', { title: 'Shared folder', description: 'Team documents' }),
    server('google-workspace', { title: 'Google', requiresOAuth: true }),
    server('slack', { title: 'Slack' }),
    server('my-pc', { title: 'My PC folder' }),
  ];
  mockStatuses.current = {
    filesystem: connected,
    'google-workspace': { connectionState: 'disconnected', requiresOAuth: true },
    slack: { connectionState: 'error', requiresOAuth: false },
    'my-pc': connected,
  };
});

describe('DataHub', () => {
  it('lists every configured connector with the desktop folder first', () => {
    renderHub();
    const list = screen.getByRole('list', { name: 'Data sources' });
    const names = within(list)
      .getAllByRole('button')
      .map((button) => button.getAttribute('data-testid'));
    expect(names).toEqual([
      'data-hub-item-my-pc',
      'data-hub-item-filesystem',
      'data-hub-item-google-workspace',
      'data-hub-item-slack',
    ]);
  });

  it('counts each observable status, reading the desktop app rather than its relay', () => {
    renderHub();
    expect(screen.getByTestId('data-hub-filter-available')).toHaveTextContent('1Available');
    expect(screen.getByTestId('data-hub-filter-needs_connection')).toHaveTextContent(
      '2Needs connection',
    );
    expect(screen.getByTestId('data-hub-filter-unavailable')).toHaveTextContent('1Unavailable');
  });

  it('narrows the list to one status and back', async () => {
    const user = userEvent.setup();
    renderHub();
    await user.click(screen.getByTestId('data-hub-filter-unavailable'));
    const list = screen.getByRole('list', { name: 'Data sources' });
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    expect(within(list).getByTestId('data-hub-item-slack')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(within(list).getAllByRole('button')).toHaveLength(4);
  });

  it('opens the connector named in the address', () => {
    renderHub('/connectors/google-workspace');
    expect(screen.getByRole('heading', { level: 2, name: 'Google' })).toBeInTheDocument();
    expect(
      screen.getByText('You sign in with your own account and see what it can see.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(screen.queryByTestId('data-hub-new-chat')).not.toBeInTheDocument();
  });

  it('describes a shared connector as one account for everyone', () => {
    renderHub('/connectors/filesystem');
    expect(
      screen.getByText('It connects with a shared account, so everyone sees the same data.'),
    ).toBeInTheDocument();
  });

  describe('desktop folder', () => {
    const online = {
      state: 'online' as const,
      deviceName: 'KIM-MINJI-PC',
      folders: ['Work files', 'Documents', 'Desktop'],
      connectedAt: null,
      installerUrl: 'https://relay.example/app/desk-app-setup-0.1.0.exe',
    };

    it('shows the switched-on folders and PC name while the app is on, without a download link', () => {
      mockDesk.current = { ...online, connectedAt: new Date().toISOString() };
      renderHub('/connectors/my-pc');
      expect(screen.getByText('Desktop app connected')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Folders (3): Work files, Documents and 1 more · KIM-MINJI-PC · Connected just now',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Get the desktop app' })).not.toBeInTheDocument();
    });

    it('lists two folders in full', () => {
      mockDesk.current = { ...online, folders: ['Work files', 'Documents'] };
      renderHub('/connectors/my-pc');
      expect(
        screen.getByText('Folders (2): Work files, Documents · KIM-MINJI-PC'),
      ).toBeInTheDocument();
    });

    it('says so when no folder is switched on', () => {
      mockDesk.current = { ...online, folders: [] };
      renderHub('/connectors/my-pc');
      expect(screen.getByText('No folders turned on · KIM-MINJI-PC')).toBeInTheDocument();
    });

    it('offers the installer while the app is off', () => {
      mockDesk.current = { ...online, state: 'offline', deviceName: null, folders: [] };
      renderHub('/connectors/my-pc');
      expect(screen.getByText('Desktop app not connected')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Get the desktop app' })).toHaveAttribute(
        'href',
        '/download',
      );
    });

    it('says the status cannot be checked when the relay is unreachable', () => {
      mockDesk.current = { ...online, state: 'unknown', deviceName: null, installerUrl: null };
      renderHub('/connectors/my-pc');
      expect(screen.getByText('Status unavailable')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Get the desktop app' })).not.toBeInTheDocument();
    });
  });

  it('shows only the overview facts the connector config sets', () => {
    mockServers.current[0] = server('filesystem', {
      title: 'Shared folder',
      overview: { refresh: 'Daily', contact: 'IT team' },
    });
    renderHub('/connectors/filesystem');
    const facts = screen.getByText('At a glance').nextElementSibling as HTMLElement;
    expect(within(facts).getByText('Refresh').nextElementSibling).toHaveTextContent('Daily');
    expect(within(facts).getByText('Contact').nextElementSibling).toHaveTextContent('IT team');
    expect(within(facts).queryByText('Period')).not.toBeInTheDocument();
  });

  it('hides the overview when the config sets none', () => {
    renderHub('/connectors/filesystem');
    expect(screen.queryByText('At a glance')).not.toBeInTheDocument();
  });

  it('lists tools by their user-facing name with read or write access', () => {
    renderHub('/connectors/google-workspace');
    const rows = within(screen.getByRole('list', { name: 'Tools' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'List eventsShows upcoming calendar events.Read',
      'Add eventAdds a new calendar event.Write',
    ]);
    expect(screen.getByText('2 tools · includes write')).toBeInTheDocument();
  });

  it('falls back to the raw tool name and server description for a tool without a label', () => {
    mockTools.current = {
      'google-workspace': {
        tools: [
          {
            name: 'drive_export',
            pluginKey: 'drive_export_mcp_google-workspace',
            description: 'Exports a file.',
          },
        ],
      },
    };
    renderHub('/connectors/google-workspace');
    expect(
      within(screen.getByRole('list', { name: 'Tools' })).getByRole('listitem'),
    ).toHaveTextContent('drive_exportExports a file.');
  });

  it('starts the OAuth connection for a server that is not connected', async () => {
    const user = userEvent.setup();
    renderHub('/connectors/google-workspace');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(mockInitializeServer).toHaveBeenCalledWith('google-workspace');
    expect(mockRevokeOAuth).not.toHaveBeenCalled();
  });

  it('offers to connect when a chat turn left a sign-in pending on the server', async () => {
    mockStatuses.current['google-workspace'] = {
      connectionState: 'connecting',
      requiresOAuth: true,
      authorizationState: 'authorizing',
    };
    const user = userEvent.setup();
    renderHub('/connectors/google-workspace');
    expect(screen.getByTestId('data-hub-item-google-workspace')).toHaveTextContent(
      'Needs connection',
    );
    expect(screen.getByTestId('data-hub-filter-needs_connection')).toHaveTextContent(
      '2Needs connection',
    );
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(mockInitializeServer).toHaveBeenCalledWith('google-workspace');
  });

  it('keeps the cancel button while this browser is signing in', () => {
    mockStartedHere.current = new Set(['google-workspace']);
    mockStatuses.current['google-workspace'] = {
      connectionState: 'connecting',
      requiresOAuth: true,
    };
    renderHub('/connectors/google-workspace');
    expect(screen.getByTestId('data-hub-item-google-workspace')).toHaveTextContent('Checking');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('revokes the OAuth connection for a connected server', async () => {
    mockStatuses.current['google-workspace'] = {
      connectionState: 'connected',
      requiresOAuth: true,
    };
    const user = userEvent.setup();
    renderHub('/connectors/google-workspace');
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(mockRevokeOAuth).toHaveBeenCalledWith('google-workspace');
    expect(mockInitializeServer).not.toHaveBeenCalled();
  });

  it('starts a new chat from an available connector', async () => {
    const user = userEvent.setup();
    renderHub('/connectors/filesystem');
    await user.click(screen.getByTestId('data-hub-new-chat'));
    expect(mockStartNewChat).toHaveBeenCalledTimes(1);
  });

  it('hides connection details from non-admins', () => {
    renderHub('/connectors/filesystem');
    expect(screen.queryByText('Connection details for admins')).not.toBeInTheDocument();
  });

  it('shows the transport and address to admins', () => {
    mockRole.current = 'ADMIN';
    renderHub('/connectors/filesystem');
    expect(screen.getByText('Connection details for admins')).toBeInTheDocument();
    expect(screen.getByText('http://filesystem/mcp')).toBeInTheDocument();
  });

  it('lists recent connector calls with the connector, tool and conversation', () => {
    mockActivity.current = [
      {
        toolKey: 'calendar_list_events_mcp_google-workspace',
        count: 2,
        conversationId: 'convo-1',
        conversationTitle: 'Weekly plan',
        createdAt: '2026-09-26T01:00:00.000Z',
      },
    ];
    renderHub();
    const table = screen.getByTestId('data-hub-recent');
    const row = within(table).getAllByRole('row')[1];
    expect(within(row).getByText('Google')).toBeInTheDocument();
    expect(within(row).getByText('List events')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Weekly plan' })).toHaveAttribute(
      'href',
      '/c/convo-1',
    );
    expect(within(row).getByText('2×')).toBeInTheDocument();
  });

  it('says so when nothing was fetched yet', () => {
    renderHub();
    expect(
      within(screen.getByTestId('data-hub-recent')).getByText('Nothing yet.'),
    ).toBeInTheDocument();
  });
});
