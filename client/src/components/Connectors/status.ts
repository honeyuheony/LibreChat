import type { DeskStatusResponse, MCPServerStatus, MCPTool } from 'librechat-data-provider';
import type { MCPServerStatusIconProps } from '~/components/MCP/MCPServerStatusIcon';
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

/** librechat.yaml에서 desk relay MCP 서버를 등록할 때 쓰는 이름이다. */
export const DESK_SERVER_NAME = 'my-pc';

export const DATA_HUB_PATH = '/connectors';

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

/** MCP 도구 정보에는 읽기 전용 표시가 없어 이름의 동사로 쓰기 권한을 추정한다. */
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

/** 데이터 허브는 앱에서 확인할 수 있는 상태만 사용자에게 보여 준다. */
export type HubStatus = 'available' | 'needs_connection' | 'unavailable' | 'checking';

export const hubStatusView: Record<HubStatus, { labelKey: TranslationKeys; tone: PillTone }> = {
  available: { labelKey: 'com_ui_data_hub_status_available', tone: 'success' },
  needs_connection: { labelKey: 'com_ui_data_hub_status_needs_connection', tone: 'neutral' },
  unavailable: { labelKey: 'com_ui_data_hub_status_unavailable', tone: 'error' },
  checking: { labelKey: 'com_ui_connectors_status_checking', tone: 'neutral' },
};

/** 현재 브라우저에서 시작하지 않은 OAuth 흐름은 로그인 중으로 표시하지 않는다. */
export function toHubStatusProps(
  props: MCPServerStatusIconProps,
  startedHere: boolean,
): MCPServerStatusIconProps {
  const { serverStatus } = props;
  const unattendedSignIn =
    !startedHere &&
    serverStatus?.requiresOAuth === true &&
    serverStatus.connectionState === 'connecting';
  return {
    ...props,
    serverStatus: unattendedSignIn
      ? {
          ...serverStatus,
          connectionState: 'disconnected',
          authorizationState: 'needs_authorization',
        }
      : serverStatus,
    isInitializing: startedHere,
    canCancel: startedHere && props.canCancel,
  };
}

interface HubStatusInput {
  serverStatus?: MCPServerStatus;
  isInitializing: boolean;
  /** 데스크톱 앱이 꺼져 있어도 MCP 연결이 유지되는 desk relay에만 적용한다. */
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
