import { useState } from 'react';
import { Button, Spinner } from '@librechat/client';
import type { MouseEvent } from 'react';
import type { MCPServerStatusIconProps } from '~/components/MCP/MCPServerStatusIcon';
import type { MCPServerDefinition } from '~/hooks';
import type { ConnectorAction } from './status';
import CustomIcon from '~/components/ui/CustomIcon';
import { getConnectorState } from './status';
import { useLocalize } from '~/hooks';
import ConnectorFrame from './Frame';
import ConnectorTools from './Tools';
import StatusPill from './Pill';

export interface ConnectorCardProps {
  server: MCPServerDefinition;
  statusProps: MCPServerStatusIconProps;
  onConnect: (serverName: string) => void;
  onDisconnect: (serverName: string) => void;
}

const actionLabelKeys = {
  connect: 'com_ui_connect',
  reconnect: 'com_ui_connectors_reconnect',
  disconnect: 'com_ui_connectors_disconnect',
  configure: 'com_ui_configure',
  cancel: 'com_ui_cancel',
} as const;

const primaryActions = new Set<ConnectorAction>(['connect', 'reconnect']);

export function ConnectorIcon({ server }: { server: MCPServerDefinition }) {
  const displayName = server.config.title || server.serverName;
  if (server.config.iconPath) {
    return <CustomIcon src={server.config.iconPath} className="size-6 object-contain" alt="" />;
  }
  return <>{displayName.slice(0, 1).toUpperCase()}</>;
}

export default function ConnectorCard({
  server,
  statusProps,
  onConnect,
  onDisconnect,
}: ConnectorCardProps) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(false);
  const { serverStatus, isInitializing, canCancel, hasCustomUserVars = false } = statusProps;
  const state = getConnectorState({ serverStatus, isInitializing, canCancel, hasCustomUserVars });
  const displayName = server.config.title || server.serverName;
  const description = server.config.description?.trim();
  const isConnected =
    serverStatus?.connectionState === 'connected' || serverStatus?.requestScoped === true;

  const runAction = (event: MouseEvent<HTMLButtonElement>) => {
    switch (state.action) {
      case 'connect':
      case 'reconnect':
        if (hasCustomUserVars && !isConnected) {
          statusProps.onConfigClick(event);
          return;
        }
        onConnect(server.serverName);
        return;
      case 'disconnect':
        onDisconnect(server.serverName);
        return;
      case 'configure':
        statusProps.onConfigClick(event);
        return;
      case 'cancel':
        statusProps.onCancel(event);
        return;
      case 'details':
        setExpanded((open) => !open);
    }
  };

  const actionLabel =
    state.action === 'details'
      ? localize(expanded ? 'com_ui_connectors_hide_details' : 'com_ui_connectors_details')
      : localize(actionLabelKeys[state.action]);

  return (
    <ConnectorFrame
      icon={<ConnectorIcon server={server} />}
      name={displayName}
      pill={<StatusPill tone={state.tone} label={localize(state.labelKey)} />}
      summary={description || localize('com_ui_mcp_detail_no_description')}
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
      action={
        <Button
          size="sm"
          shape="theme"
          variant={primaryActions.has(state.action) ? 'submit' : 'outline'}
          aria-label={`${displayName} ${actionLabel}`}
          onClick={runAction}
        >
          {state.action === 'cancel' && <Spinner className="size-3.5" aria-hidden="true" />}
          {actionLabel}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {description && (
          <p className="whitespace-pre-wrap break-words text-sm text-text-primary">{description}</p>
        )}
        <ConnectorTools serverName={server.serverName} isConnected={isConnected} />
      </div>
    </ConnectorFrame>
  );
}
