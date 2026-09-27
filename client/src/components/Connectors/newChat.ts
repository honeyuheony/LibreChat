import type { TUser } from 'librechat-data-provider';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';

export function isNewChatDefaultOn(server: MCPServerDefinition, user?: TUser | null): boolean {
  return (
    user?.personalization?.connectorDefaults?.[server.serverName] ??
    server.config.defaultOn === true
  );
}

/** 사용자 설정과 커넥터 목록이 준비될 때까지 `disabled_mcp` 값을 정하지 않는다. */
export function getNewChatConnectorsOff(
  servers: MCPServerDefinition[],
  user?: TUser | null,
): string[] | undefined {
  if (!user || servers.length === 0) {
    return undefined;
  }
  return servers
    .filter((server) => !isNewChatDefaultOn(server, user))
    .map((server) => server.serverName);
}
