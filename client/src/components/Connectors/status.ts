import type { DeskStatusResponse, MCPServerStatus, MCPTool } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';

export type PillTone = 'success' | 'neutral' | 'error';
export type ConnectorAction =
  | 'connect'
  | 'disconnect'
  | 'configure'
  | 'reconnect'
  | 'cancel'
  | 'details';

export interface ConnectorState {
  labelKey: TranslationKeys;
  tone: PillTone;
  action: ConnectorAction;
}

interface ConnectorStateInput {
  serverStatus?: MCPServerStatus;
  isInitializing: boolean;
  canCancel: boolean;
  hasCustomUserVars: boolean;
}

/** The server name the desk relay MCP server is configured under (`librechat.yaml` `mcpServers.my-pc`). */
export const DESK_SERVER_NAME = 'my-pc';

/** The sidebar's data hub page, which lists every connector (`routes/index.tsx`). */
export const DATA_HUB_PATH = '/connectors';

/** Public page every "get the desktop app" entry opens (`routes/index.tsx`). */
export const DESK_DOWNLOAD_PATH = '/download';

export function getConnectorState({
  serverStatus,
  isInitializing,
  canCancel,
  hasCustomUserVars,
}: ConnectorStateInput): ConnectorState {
  if (isInitializing || serverStatus?.connectionState === 'connecting') {
    return {
      labelKey: 'com_ui_connectors_status_connecting',
      tone: 'neutral',
      action: canCancel ? 'cancel' : 'details',
    };
  }
  if (!serverStatus) {
    return { labelKey: 'com_ui_connectors_status_checking', tone: 'neutral', action: 'details' };
  }
  if (serverStatus.requestScoped === true) {
    return { labelKey: 'com_ui_connectors_status_on_demand', tone: 'neutral', action: 'details' };
  }

  const { connectionState, requiresOAuth } = serverStatus;
  const isConnected = connectionState === 'connected';
  if (requiresOAuth) {
    if (isConnected) {
      return {
        labelKey: 'com_ui_connectors_status_connected',
        tone: 'success',
        action: 'disconnect',
      };
    }
    return connectionState === 'error'
      ? { labelKey: 'com_ui_connectors_status_error', tone: 'error', action: 'connect' }
      : { labelKey: 'com_ui_connectors_status_not_connected', tone: 'neutral', action: 'connect' };
  }
  if (hasCustomUserVars) {
    return isConnected
      ? { labelKey: 'com_ui_connectors_status_connected', tone: 'success', action: 'configure' }
      : { labelKey: 'com_ui_connectors_status_needs_setup', tone: 'neutral', action: 'configure' };
  }
  if (isConnected) {
    return { labelKey: 'com_ui_connectors_status_builtin', tone: 'success', action: 'details' };
  }
  return connectionState === 'error'
    ? { labelKey: 'com_ui_connectors_status_error', tone: 'error', action: 'reconnect' }
    : { labelKey: 'com_ui_connectors_status_not_connected', tone: 'neutral', action: 'connect' };
}

/** MCP tool discovery carries no read-only annotation, so write access is inferred from verbs in the tool name. */
const WRITE_VERBS = new Set([
  'add',
  'append',
  'archive',
  'cancel',
  'create',
  'delete',
  'edit',
  'insert',
  'modify',
  'move',
  'patch',
  'post',
  'put',
  'remove',
  'rename',
  'reply',
  'send',
  'set',
  'update',
  'upload',
  'write',
]);

export function isWriteTool(toolName: string): boolean {
  return toolName
    .split(/[^A-Za-z0-9]+|(?<=[a-z])(?=[A-Z])/)
    .some((word) => WRITE_VERBS.has(word.toLowerCase()));
}

export function summarizeToolAccess(tools: MCPTool[]): { count: number; hasWrite: boolean } {
  return { count: tools.length, hasWrite: tools.some((tool) => isWriteTool(tool.name)) };
}

/** What the data hub tells the user, limited to what the app can actually observe. */
export type HubStatus = 'available' | 'needs_connection' | 'unavailable' | 'checking';

export const hubStatusView: Record<HubStatus, { labelKey: TranslationKeys; tone: PillTone }> = {
  available: { labelKey: 'com_ui_data_hub_status_available', tone: 'success' },
  needs_connection: { labelKey: 'com_ui_data_hub_status_needs_connection', tone: 'neutral' },
  unavailable: { labelKey: 'com_ui_data_hub_status_unavailable', tone: 'error' },
  checking: { labelKey: 'com_ui_connectors_status_checking', tone: 'neutral' },
};

interface HubStatusInput {
  serverStatus?: MCPServerStatus;
  isInitializing: boolean;
  /** Only for the desk relay server, whose MCP connection stays up while the app is closed. */
  desk?: { state?: DeskStatusResponse['state'] };
}

export function getHubStatus({ serverStatus, isInitializing, desk }: HubStatusInput): HubStatus {
  if (desk) {
    if (!desk.state) {
      return 'checking';
    }
    return desk.state === 'online' ? 'available' : 'needs_connection';
  }
  if (isInitializing || !serverStatus || serverStatus.connectionState === 'connecting') {
    return 'checking';
  }
  if (serverStatus.requestScoped === true || serverStatus.connectionState === 'connected') {
    return 'available';
  }
  if (serverStatus.connectionState === 'error' && serverStatus.requiresOAuth !== true) {
    return 'unavailable';
  }
  return 'needs_connection';
}
