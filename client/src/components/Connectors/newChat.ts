import type { TUser } from 'librechat-data-provider';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';

/**
 * Whether a new chat starts with this connector switched on: the user's own choice from the
 * data hub, else the connector config's `defaultOn`, else off.
 */
export function isNewChatDefaultOn(server: MCPServerDefinition, user?: TUser | null): boolean {
  return (
    user?.personalization?.connectorDefaults?.[server.serverName] ??
    server.config.defaultOn === true
  );
}

/**
 * The connectors a new chat starts with switched off, in `disabled_mcp` form. Undefined until
 * both the user and the catalog have loaded, so nothing is decided from a half-read state.
 */
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
