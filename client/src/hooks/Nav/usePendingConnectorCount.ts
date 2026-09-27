import { DESK_SERVER_NAME, getHubStatus, toHubStatusProps } from '~/components/Connectors/status';
import { useDeskStatusQuery } from '~/data-provider/Connectors/queries';
import { useMCPServerManager } from '~/hooks/MCP/useMCPServerManager';

/** 데이터 허브와 같은 연결 상태를 세어 사이드바 배지와 목록을 맞춘다. */
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
