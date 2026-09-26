import type { MCPServerDefinition } from '~/hooks';
import CustomIcon from '~/components/ui/CustomIcon';

export default function ConnectorIcon({ server }: { server: MCPServerDefinition }) {
  const displayName = server.config.title || server.serverName;
  if (server.config.iconPath) {
    return <CustomIcon src={server.config.iconPath} className="size-6 object-contain" alt="" />;
  }
  return <>{displayName.slice(0, 1).toUpperCase()}</>;
}
