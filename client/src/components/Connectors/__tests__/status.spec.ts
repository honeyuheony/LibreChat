import type { MCPServerStatus } from 'librechat-data-provider';
import { getConnectorState, isWriteTool, summarizeToolAccess } from '../status';

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
