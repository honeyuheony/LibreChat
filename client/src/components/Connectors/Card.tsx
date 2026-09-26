import { useState } from 'react';
import { Button, Spinner } from '@librechat/client';
import type { MCPServerStatusIconProps } from '~/components/MCP/MCPServerStatusIcon';
import type { MCPServerDefinition } from '~/hooks';
import { actionLabelKeys, primaryActions, runConnectorAction } from './actions';
import { getConnectorState } from './status';
import { useLocalize } from '~/hooks';
import ConnectorFrame from './Frame';
import ConnectorTools from './Tools';
import ConnectorIcon from './Icon';
import StatusPill from './Pill';

export interface ConnectorCardProps {
  server: MCPServerDefinition;
  statusProps: MCPServerStatusIconProps;
  onConnect: (serverName: string) => void;
  onDisconnect: (serverName: string) => void;
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
          onClick={(event) =>
            runConnectorAction(event, {
              action: state.action,
              serverName: server.serverName,
              statusProps,
              isConnected,
              onConnect,
              onDisconnect,
              onDetails: () => setExpanded((open) => !open),
            })
          }
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
