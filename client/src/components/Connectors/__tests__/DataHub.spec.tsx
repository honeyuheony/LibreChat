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
const mockServers: { current: MCPServerDefinition[] } = { current: [] };
const mockStatuses: { current: Record<string, object | undefined> } = { current: {} };
const mockDesk: { current: DeskStatusResponse | undefined } = { current: undefined };
const mockActivity: { current: ConnectorActivityItem[] } = { current: [] };
const mockRole = { current: 'USER' };

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
      revokeOAuthForServer: jest.fn(),
      getConfigDialogProps: () => null,
      getServerStatusIconProps: (serverName: string) => ({
        serverName,
        serverStatus: mockStatuses.current[serverName],
        isInitializing: false,
        canCancel: false,
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
    data: {
      servers: {
        'google-workspace': {
          tools: [
            {
              name: 'calendar_list_events',
              pluginKey: 'calendar_list_events_mcp_google-workspace',
            },
            {
              name: 'calendar_create_event',
              pluginKey: 'calendar_create_event_mcp_google-workspace',
            },
          ],
        },
      },
    },
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
  mockDesk.current = {
    state: 'offline',
    deviceName: null,
    folders: [],
    connectedAt: null,
    installerUrl: null,
  };
  mockActivity.current = [];
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

  it('describes the desktop folder by the app state and its switched-on folders', () => {
    mockDesk.current = { ...mockDesk.current!, state: 'online', folders: ['문서', '바탕 화면'] };
    renderHub('/connectors/my-pc');
    expect(
      screen.getByText('Your desktop app is connected with 2 folders switched on.'),
    ).toBeInTheDocument();
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

  it('marks the tools that change data', () => {
    renderHub('/connectors/google-workspace');
    const tools = screen.getByRole('list', { name: 'Tools' });
    expect(within(tools).getByText('Add event · Write')).toBeInTheDocument();
    expect(within(tools).getByText('List events')).toBeInTheDocument();
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
