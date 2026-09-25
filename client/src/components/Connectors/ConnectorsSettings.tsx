import { useEffect, useMemo } from 'react';
import { useLocalize, useMCPServerManager, activateCatalog } from '~/hooks';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { useMCPRefresh } from '~/hooks/MCP/useMCPRefresh';
import { DESK_SERVER_NAME } from './status';
import DeskConnectorCard from './Desk';
import ConnectorCard from './Card';

/** Settings "Connectors" tab: every configured MCP server, with the desk relay server pinned first. */
export default function ConnectorsSettings() {
  const localize = useLocalize();
  useEffect(() => {
    activateCatalog('mcpServers');
    activateCatalog('mcpTools');
  }, []);
  const {
    availableMCPServers,
    isLoading,
    initializeServer,
    revokeOAuthForServer,
    getServerStatusIconProps,
    getConfigDialogProps,
  } = useMCPServerManager({ observeToolAuthorization: true });
  useMCPRefresh({ enabled: !isLoading && availableMCPServers.length > 0 });
  const configDialogProps = getConfigDialogProps();

  const { deskServer, otherServers } = useMemo(() => {
    const desk = availableMCPServers.find((server) => server.serverName === DESK_SERVER_NAME);
    return {
      deskServer: desk,
      otherServers: availableMCPServers.filter((server) => server !== desk),
    };
  }, [availableMCPServers]);

  let list = (
    <div role="list" className="flex flex-col gap-3" aria-label={localize('com_ui_connectors')}>
      {deskServer && <DeskConnectorCard server={deskServer} />}
      {otherServers.map((server) => (
        <ConnectorCard
          key={server.serverName}
          server={server}
          statusProps={getServerStatusIconProps(server.serverName)}
          onConnect={initializeServer}
          onDisconnect={revokeOAuthForServer}
        />
      ))}
    </div>
  );
  if (isLoading) {
    list = (
      <p role="status" aria-live="polite" className="text-sm text-text-secondary">
        {localize('com_ui_connectors_loading')}
      </p>
    );
  } else if (availableMCPServers.length === 0) {
    list = (
      <p className="rounded-theme-surface border border-border-light px-4 py-8 text-center text-sm text-text-secondary">
        {localize('com_ui_connectors_empty')}
      </p>
    );
  }

  return (
    <section aria-labelledby="connectors-settings-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h3 id="connectors-settings-heading" className="text-xl font-bold text-text-primary">
          {localize('com_ui_settings_tab_connectors')}
        </h3>
        <p className="max-w-xl text-sm leading-relaxed text-text-secondary">
          {localize('com_ui_connectors_description')}
        </p>
      </div>
      {list}
      {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
    </section>
  );
}
