import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import userEvent from '@testing-library/user-event';
import { dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MCPServerStatus, MCPServersResponse, MCPTool } from 'librechat-data-provider';
import type { MCPServerDefinition } from '~/hooks';
import MCPServerDetail from './MCPServerDetail';
import MCPServerCard from './MCPServerCard';

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useMCPServerManager: () => ({
    initializeServer: jest.fn(),
    revokeOAuthForServer: jest.fn(),
  }),
}));

jest.mock('./MCPServerDialog', () => ({
  __esModule: true,
  default: () => null,
}));

const server: MCPServerDefinition = {
  serverName: 'alpha',
  effectivePermissions: 1,
  config: {
    type: 'http',
    url: 'https://example.com',
    title: 'Alpha Server',
    description: 'Full server description',
  },
};

const connectedStatus: MCPServerStatus = {
  connectionState: 'connected',
  requiresOAuth: false,
};

const disconnectedStatus: MCPServerStatus = {
  connectionState: 'disconnected',
  requiresOAuth: false,
};

function createToolsResponse(tools: MCPTool[]): MCPServersResponse {
  return {
    servers: {
      alpha: {
        name: 'alpha',
        icon: '',
        authenticated: true,
        authConfig: [],
        tools,
      },
    },
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, cacheTime: 0 },
    },
  });
}

function renderWithQueryClient(children: React.ReactNode) {
  const queryClient = createQueryClient();
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

function renderCard(serverStatus: MCPServerStatus = connectedStatus) {
  return renderWithQueryClient(
    <MCPServerCard
      server={server}
      getServerStatusIconProps={(serverName) => ({
        serverName,
        serverStatus,
        onConfigClick: jest.fn(),
        isInitializing: false,
        canCancel: false,
        onCancel: jest.fn(),
      })}
      canCreateEditMCPs={false}
    />,
  );
}

function renderDetail(serverStatus: MCPServerStatus = connectedStatus) {
  return renderWithQueryClient(
    <MCPServerDetail
      serverName="alpha"
      displayName="Alpha Server"
      description="Full server description"
      serverStatus={serverStatus}
      isInitializing={false}
      isOpen={true}
    />,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MCPServerDetail', () => {
  test('renders each tool name and its description', async () => {
    jest.spyOn(dataService, 'getMCPTools').mockResolvedValue(
      createToolsResponse([
        {
          name: 'lookup_record',
          pluginKey: 'mcp__alpha__lookup_record',
          description: 'Finds a record by its identifier.',
        },
      ]),
    );

    renderDetail();

    expect(await screen.findByText('lookup_record')).toBeInTheDocument();
    expect(screen.getByText('Finds a record by its identifier.')).toBeInTheDocument();
  });

  test('shows a message when the server has no tools', async () => {
    jest.spyOn(dataService, 'getMCPTools').mockResolvedValue(createToolsResponse([]));

    renderDetail();

    expect(await screen.findByText('com_ui_mcp_detail_no_tools')).toBeInTheDocument();
  });

  test('shows the loading message while tools are being fetched', async () => {
    let resolveTools!: (response: MCPServersResponse) => void;
    const pendingTools = new Promise<MCPServersResponse>((resolve) => {
      resolveTools = resolve;
    });
    jest.spyOn(dataService, 'getMCPTools').mockReturnValue(pendingTools);

    renderDetail();

    expect(await screen.findByText('com_ui_mcp_detail_loading_tools')).toBeInTheDocument();
    resolveTools(createToolsResponse([]));
    await waitFor(() => expect(screen.queryByText('com_ui_mcp_detail_loading_tools')).toBeNull());
  });

  test('shows an error message when the tool request fails', async () => {
    jest.spyOn(dataService, 'getMCPTools').mockRejectedValue(new Error('request failed'));

    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent('com_ui_mcp_detail_error_tools');
  });

  test('asks users to connect when tool information is unavailable', async () => {
    jest.spyOn(dataService, 'getMCPTools').mockResolvedValue({ servers: {} });

    renderDetail(disconnectedStatus);

    expect(await screen.findByText('com_ui_mcp_detail_connect_to_view_tools')).toBeInTheDocument();
  });

  test('opens the details when the card is clicked', async () => {
    jest.spyOn(dataService, 'getMCPTools').mockResolvedValue(createToolsResponse([]));

    renderCard();

    fireEvent.click(screen.getByLabelText('Alpha Server - com_nav_mcp_status_connected'));

    expect(await screen.findByRole('region', { name: 'com_ui_tools' })).toBeInTheDocument();
  });

  test('does not open the details when a card action is clicked', () => {
    jest.spyOn(dataService, 'getMCPTools').mockResolvedValue(createToolsResponse([]));

    renderCard(disconnectedStatus);

    fireEvent.click(screen.getByRole('button', { name: 'com_nav_mcp_connect' }));

    expect(screen.queryByRole('region', { name: 'com_ui_tools' })).not.toBeInTheDocument();
  });

  test('keeps description links from opening the details', () => {
    jest.spyOn(dataService, 'getMCPTools').mockResolvedValue(createToolsResponse([]));

    renderWithQueryClient(
      <MCPServerCard
        server={{
          ...server,
          config: { ...server.config, description: 'Read more at https://example.com/docs' },
        }}
        getServerStatusIconProps={(serverName) => ({
          serverName,
          serverStatus: connectedStatus,
          onConfigClick: jest.fn(),
          isInitializing: false,
          canCancel: false,
          onCancel: jest.fn(),
        })}
        canCreateEditMCPs={false}
      />,
    );

    const link = screen.getByRole('link', { name: 'https://example.com/docs' });
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
    fireEvent.click(link);

    expect(screen.queryByRole('region', { name: 'com_ui_tools' })).not.toBeInTheDocument();
  });

  test('supports Enter, Space, and Escape from the keyboard', async () => {
    const user = userEvent.setup();
    jest.spyOn(dataService, 'getMCPTools').mockResolvedValue(createToolsResponse([]));

    renderCard();

    const trigger = screen.getByRole('button', { name: 'Alpha Server' });
    trigger.focus();
    expect(await screen.findByRole('region', { name: 'com_ui_tools' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'com_ui_tools' })).not.toBeInTheDocument(),
    );

    await user.keyboard('{Enter}');
    expect(await screen.findByRole('region', { name: 'com_ui_tools' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'com_ui_tools' })).not.toBeInTheDocument(),
    );

    await user.keyboard(' ');
    expect(await screen.findByRole('region', { name: 'com_ui_tools' })).toBeInTheDocument();
  });
});
