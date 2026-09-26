import type { MCPServerStatus } from 'librechat-data-provider';
import {
  getHubStatus,
  isWriteTool,
  toHubStatusProps,
  getConnectorState,
  summarizeToolAccess,
} from '../status';

const status = (overrides: Partial<MCPServerStatus>): MCPServerStatus => ({
  requiresOAuth: false,
  connectionState: 'connected',
  ...overrides,
});

const idle = { isInitializing: false, canCancel: false, hasCustomUserVars: false };

describe('getConnectorState', () => {
  it('offers connect for an OAuth server that is not connected yet', () => {
    expect(
      getConnectorState({
        ...idle,
        serverStatus: status({ requiresOAuth: true, connectionState: 'disconnected' }),
      }),
    ).toEqual({
      labelKey: 'com_ui_connectors_status_not_connected',
      tone: 'neutral',
      action: 'connect',
    });
  });

  it('offers disconnect for a connected OAuth server', () => {
    expect(getConnectorState({ ...idle, serverStatus: status({ requiresOAuth: true }) })).toEqual({
      labelKey: 'com_ui_connectors_status_connected',
      tone: 'success',
      action: 'disconnect',
    });
  });

  it('marks a connected shared server as built in with a details action', () => {
    expect(getConnectorState({ ...idle, serverStatus: status({}) })).toEqual({
      labelKey: 'com_ui_connectors_status_builtin',
      tone: 'success',
      action: 'details',
    });
  });

  it('offers reconnect for a shared server in error', () => {
    expect(
      getConnectorState({ ...idle, serverStatus: status({ connectionState: 'error' }) }),
    ).toEqual({ labelKey: 'com_ui_connectors_status_error', tone: 'error', action: 'reconnect' });
  });

  it('asks for setup when per-user variables are still missing', () => {
    expect(
      getConnectorState({
        ...idle,
        hasCustomUserVars: true,
        serverStatus: status({ connectionState: 'disconnected' }),
      }),
    ).toEqual({
      labelKey: 'com_ui_connectors_status_needs_setup',
      tone: 'neutral',
      action: 'configure',
    });
  });

  it('offers cancel while a cancellable OAuth flow is running', () => {
    expect(
      getConnectorState({
        ...idle,
        isInitializing: true,
        canCancel: true,
        serverStatus: status({ requiresOAuth: true, connectionState: 'disconnected' }),
      }).action,
    ).toBe('cancel');
  });

  it('shows checking before the first status poll answers', () => {
    expect(getConnectorState({ ...idle, serverStatus: undefined }).labelKey).toBe(
      'com_ui_connectors_status_checking',
    );
  });

  it('labels request-scoped servers as connecting inside a chat', () => {
    expect(
      getConnectorState({
        ...idle,
        serverStatus: status({ connectionState: 'disconnected', requestScoped: true }),
      }).labelKey,
    ).toBe('com_ui_connectors_status_on_demand');
  });
});

describe('isWriteTool', () => {
  it.each([
    ['calendar_create_event', true],
    ['sendMessage', true],
    ['gmail_search', false],
    ['gmail_read', false],
    ['list_folder', false],
    ['read_hangul_file', false],
    ['settings_reader', false],
  ])('classifies %s as write=%s', (toolName, expected) => {
    expect(isWriteTool(toolName)).toBe(expected);
  });
});

describe('summarizeToolAccess', () => {
  it('counts tools and notes when any of them writes', () => {
    const tools = [
      { name: 'calendar_list_events', pluginKey: 'a', description: '' },
      { name: 'calendar_create_event', pluginKey: 'b', description: '' },
    ];
    expect(summarizeToolAccess(tools)).toEqual({ count: 2, hasWrite: true });
    expect(summarizeToolAccess(tools.slice(0, 1))).toEqual({ count: 1, hasWrite: false });
  });
});

describe('getHubStatus', () => {
  it('reads a failed Google sign-in as needing a connection, not as broken', () => {
    expect(
      getHubStatus({
        serverStatus: status({ connectionState: 'error', requiresOAuth: true }),
        isInitializing: false,
      }),
    ).toBe('needs_connection');
  });

  it('reads a failed shared server as unavailable', () => {
    expect(
      getHubStatus({ serverStatus: status({ connectionState: 'error' }), isInitializing: false }),
    ).toBe('unavailable');
  });

  it('reads a server that connects per chat as available', () => {
    expect(
      getHubStatus({
        serverStatus: status({ connectionState: 'disconnected', requestScoped: true }),
        isInitializing: false,
      }),
    ).toBe('available');
  });

  it('waits while the server or the desktop app is still being checked', () => {
    expect(getHubStatus({ serverStatus: undefined, isInitializing: false })).toBe('checking');
    expect(
      getHubStatus({
        serverStatus: status({ connectionState: 'connected' }),
        isInitializing: false,
        desk: {},
      }),
    ).toBe('checking');
  });
});

describe('toHubStatusProps', () => {
  const props = (serverStatus: MCPServerStatus) => ({
    serverName: 'google-workspace',
    serverStatus,
    isInitializing: true,
    canCancel: true,
    onConfigClick: jest.fn(),
    onCancel: jest.fn(),
  });
  const pending = status({
    requiresOAuth: true,
    connectionState: 'connecting',
    authorizationState: 'authorizing',
  });

  it('reads a sign-in a chat turn opened on the server as still needing a connection', () => {
    const hub = toHubStatusProps(props(pending), false);
    expect(hub.serverStatus?.connectionState).toBe('disconnected');
    expect(hub.isInitializing).toBe(false);
    expect(hub.canCancel).toBe(false);
    expect(getHubStatus(hub)).toBe('needs_connection');
    expect(getConnectorState({ ...hub, hasCustomUserVars: false }).action).toBe('connect');
  });

  it('keeps a sign-in this browser started as in progress', () => {
    const hub = toHubStatusProps(props(pending), true);
    expect(hub.serverStatus).toBe(pending);
    expect(getHubStatus(hub)).toBe('checking');
    expect(getConnectorState({ ...hub, hasCustomUserVars: false }).action).toBe('cancel');
  });

  it('leaves a shared server that is connecting alone', () => {
    const connecting = status({ connectionState: 'connecting' });
    expect(toHubStatusProps(props(connecting), false).serverStatus).toBe(connecting);
  });
});
