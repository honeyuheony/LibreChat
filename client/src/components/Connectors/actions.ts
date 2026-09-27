import type { MouseEvent } from 'react';
import type { MCPServerStatusIconProps } from '~/components/MCP/MCPServerStatusIcon';
import type { ConnectorAction } from './status';

export const actionLabelKeys = {
  connect: 'com_ui_connect',
  reconnect: 'com_ui_connectors_reconnect',
  disconnect: 'com_ui_connectors_disconnect',
  configure: 'com_ui_configure',
  cancel: 'com_ui_cancel',
} as const;

export const primaryActions = new Set<ConnectorAction>(['connect', 'reconnect']);

interface RunConnectorActionInput {
  action: ConnectorAction;
  serverName: string;
  statusProps: MCPServerStatusIconProps;
  isConnected: boolean;
  onConnect: (serverName: string) => void;
  onDisconnect: (serverName: string) => void;
  onDetails: () => void;
}

/** 사용자별 값이 필요한 서버는 연결 전에 설정 대화상자에서 값을 입력한다. */
export function runConnectorAction(
  event: MouseEvent<HTMLButtonElement>,
  {
    action,
    serverName,
    statusProps,
    isConnected,
    onConnect,
    onDisconnect,
    onDetails,
  }: RunConnectorActionInput,
) {
  const hasCustomUserVars = statusProps.hasCustomUserVars ?? false;
  switch (action) {
    case 'connect':
    case 'reconnect':
      if (hasCustomUserVars && !isConnected) {
        statusProps.onConfigClick(event);
        return;
      }
      onConnect(serverName);
      return;
    case 'disconnect':
      onDisconnect(serverName);
      return;
    case 'configure':
      statusProps.onConfigClick(event);
      return;
    case 'cancel':
      statusProps.onCancel(event);
      return;
    case 'details':
      onDetails();
  }
}
