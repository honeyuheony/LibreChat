import { DESK_SERVER_NAME, getHubStatus, toHubStatusProps } from '~/components/Connectors/status';
import { useDeskStatusQuery } from '~/data-provider/Connectors/queries';
import { useMCPServerManager } from '~/hooks/MCP/useMCPServerManager';

/**
 * How many connectors the data hub would mark 「연결 필요」 for this user, for the sidebar's
 * pending badge. It reads the same statuses the hub does, so the badge and the hub agree.
 */
export default function usePendingConnectorCount(): number {
  const { availableMCPServers, getServerStatusIconProps, isInitializing } = useMCPServerManager({
    observeToolAuthorization: true,
  });
  const hasDesk = availableMCPServers.some((server) => server.serverName === DESK_SERVER_NAME);
  const { data: deskStatus, isError: deskError } = useDeskStatusQuery({ enabled: hasDesk });

  return availableMCPServers.filter((server) => {
    const props = toHubStatusProps(
      getServerStatusIconProps(server.serverName),
      isInitializing(server.serverName),
    );
    const status = getHubStatus({
      serverStatus: props.serverStatus,
      isInitializing: props.isInitializing,
      desk:
        server.serverName === DESK_SERVER_NAME
          ? { state: deskError ? 'unknown' : deskStatus?.state }
          : undefined,
    });
    return status === 'needs_connection';
  }).length;
}
