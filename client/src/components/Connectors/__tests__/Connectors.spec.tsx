import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import userEvent from '@testing-library/user-event';
import { dataService } from 'librechat-data-provider';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DeskStatusResponse, MCPServerStatus, MCPTool } from 'librechat-data-provider';
import type { MCPServerDefinition } from '~/hooks';
import DeskConnectorCard from '../Desk';
import ConnectorCard from '../Card';

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('~/hooks', () => {
  const english = jest.requireActual<Record<string, string>>('~/locales/en/translation.json');
  const localize = (key: string, params?: Record<string, string>) =>
    Object.entries(params ?? {}).reduce(
      (text, [name, value]) => text.replace(`{{${name}}}`, value),
      english[key] ?? key,
    );
  return { useLocalize: () => localize };
});

const googleServer: MCPServerDefinition = {
  serverName: 'google-workspace',
  effectivePermissions: 1,
  config: {
    type: 'streamable-http',
    url: 'http://google-mcp:8767/mcp',
    title: 'Google Calendar and Mail',
    description: 'Reads events and mail.',
  },
};

const deskServer: MCPServerDefinition = {
  serverName: 'my-pc',
  effectivePermissions: 1,
  config: { type: 'streamable-http', url: 'http://desk-relay:8766/mcp', title: 'My PC folder' },
};

const googleTools: MCPTool[] = [
  {
    name: 'calendar_list_events',
    pluginKey: 'calendar_list_events_mcp_google-workspace',
    description: 'Lists upcoming events.',
  },
  {
    name: 'calendar_create_event',
    pluginKey: 'calendar_create_event_mcp_google-workspace',
    description: 'Adds an event.',
  },
];

function renderWithQueries(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function renderGoogleCard(serverStatus: MCPServerStatus) {
  const onConnect = jest.fn();
  const onDisconnect = jest.fn();
  renderWithQueries(
    <div role="list">
      <ConnectorCard
        server={googleServer}
        statusProps={{
          serverName: googleServer.serverName,
          serverStatus,
          onConfigClick: jest.fn(),
          isInitializing: false,
          canCancel: false,
          onCancel: jest.fn(),
        }}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />
    </div>,
  );
  return { onConnect, onDisconnect };
}

function mockTools(serverName: string, tools: MCPTool[]) {
  jest.spyOn(dataService, 'getMCPTools').mockResolvedValue({
    servers: {
      [serverName]: { name: serverName, icon: '', authenticated: true, authConfig: [], tools },
    },
  });
}

function mockDesk(status: DeskStatusResponse) {
  jest.spyOn(dataService, 'getDeskStatus').mockResolvedValue(status);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ConnectorCard', () => {
  it('starts the OAuth connection for a server that is not connected', async () => {
    const { onConnect, onDisconnect } = renderGoogleCard({
      requiresOAuth: true,
      connectionState: 'disconnected',
    });

    expect(screen.getByText('Not connected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Google Calendar and Mail Connect' }));

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledWith('google-workspace');
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it('revokes the OAuth connection for a connected server', async () => {
    const { onConnect, onDisconnect } = renderGoogleCard({
      requiresOAuth: true,
      connectionState: 'connected',
    });

    expect(screen.getByText('Connected')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Google Calendar and Mail Disconnect' }),
    );

    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(onDisconnect).toHaveBeenCalledWith('google-workspace');
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('lists tools by their user-facing name with read or write access when the card is opened', async () => {
    mockTools('google-workspace', googleTools);
    renderGoogleCard({ requiresOAuth: true, connectionState: 'connected' });

    await userEvent.click(screen.getByRole('button', { expanded: false }));

    const toolList = await screen.findByRole('list', { name: 'Tools' });
    const rows = within(toolList).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'List eventsShows upcoming calendar events.Read',
      'Add eventAdds a new calendar event.Write',
    ]);
    expect(screen.getByText('2 tools · includes write')).toBeInTheDocument();
  });

  it('falls back to the raw tool name and server description for a tool without a label', async () => {
    mockTools('google-workspace', [
      {
        name: 'drive_export',
        pluginKey: 'drive_export_mcp_google-workspace',
        description: 'Exports a file.',
      },
    ]);
    renderGoogleCard({ requiresOAuth: true, connectionState: 'connected' });

    await userEvent.click(screen.getByRole('button', { expanded: false }));

    const toolList = await screen.findByRole('list', { name: 'Tools' });
    expect(within(toolList).getByRole('listitem')).toHaveTextContent('drive_exportExports a file.');
  });
});

describe('DeskConnectorCard', () => {
  it('shows the allowed folder and PC name while the app is on, without a download link', async () => {
    mockTools('my-pc', []);
    mockDesk({
      state: 'online',
      deviceName: 'KIM-MINJI-PC',
      folderName: 'Work files',
      connectedAt: new Date().toISOString(),
      installerUrl: 'https://relay.example/app/desk-app-setup-0.1.0.exe',
    });

    renderWithQueries(
      <div role="list">
        <DeskConnectorCard server={deskServer} />
      </div>,
    );

    expect(await screen.findByText('Desktop app connected')).toBeInTheDocument();
    expect(
      screen.getByText('Allowed folder “Work files” · KIM-MINJI-PC · Connected just now'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Get the desktop app' })).not.toBeInTheDocument();
  });

  it('offers the installer while the app is off', async () => {
    mockTools('my-pc', []);
    mockDesk({
      state: 'offline',
      deviceName: null,
      folderName: null,
      connectedAt: null,
      installerUrl: 'https://relay.example/app/desk-app-setup-0.1.0.exe',
    });

    renderWithQueries(
      <div role="list">
        <DeskConnectorCard server={deskServer} />
      </div>,
    );

    expect(await screen.findByText('Desktop app not connected')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get the desktop app' })).toHaveAttribute(
      'href',
      '/download',
    );
  });

  it('says the status cannot be checked when the relay is unreachable', async () => {
    mockTools('my-pc', []);
    mockDesk({
      state: 'unknown',
      deviceName: null,
      folderName: null,
      connectedAt: null,
      installerUrl: null,
    });

    renderWithQueries(
      <div role="list">
        <DeskConnectorCard server={deskServer} />
      </div>,
    );

    expect(await screen.findByText('Status unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
