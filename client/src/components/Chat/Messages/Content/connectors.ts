import { useMemo } from 'react';
import { normalizeServerName } from 'librechat-data-provider';
import { useCatalogReady } from '~/hooks/useCatalogWarmup';
import { useMCPServersQuery } from '~/data-provider';

/** 정규화한 MCP 서버 이름을 설정의 `title`에 연결한다. */
export function useConnectorTitles(): Map<string, string> {
  const mcpServersReady = useCatalogReady('mcpServers');
  const { data: servers } = useMCPServersQuery({ enabled: mcpServersReady });

  return useMemo(() => {
    const titles = new Map<string, string>();
    for (const [serverName, config] of Object.entries(servers ?? {})) {
      if (typeof config.title === 'string' && config.title.trim() !== '') {
        titles.set(normalizeServerName(serverName), config.title.trim());
      }
    }
    return titles;
  }, [servers]);
}

export function getConnectorTitle(titles: Map<string, string>, serverName: string): string {
  return titles.get(serverName) ?? serverName;
}
