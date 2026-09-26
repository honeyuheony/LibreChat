import React, { useMemo } from 'react';
import { VectorIcon } from '@librechat/client';
import { Box, Brain, Globe, Settings, ScrollText, TerminalSquareIcon } from 'lucide-react';
import {
  AuthType,
  Permissions,
  ArtifactModes,
  PermissionTypes,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';
import {
  useLocalize,
  useHasAccess,
  useAuthContext,
  useHasMemoryAccess,
  useAgentCapabilities,
} from '~/hooks';
import useAgentConnectorSelection from './useAgentConnectorSelection';
import { useBadgeRowContext } from '~/Providers';

export interface BuiltinTool {
  id: string;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  onToggle: () => void;
  /** An extra control drawn beside the switch, such as the web search key settings. */
  accessory?: React.ReactNode;
}

/**
 * What the composer can switch on for this conversation: connectors (MCP servers) and the
 * built-in tools, with which are on and how to flip them. Reads the badge row context, so
 * it runs under `BadgeRowProvider`.
 */
export default function useComposerTools({
  showBuiltinTools,
  showConnectors = true,
  agentId,
}: {
  /** Built-in toggles only reach the model on endpoints that build an ephemeral agent. */
  showBuiltinTools: boolean;
  /** Connectors reach every endpoint that runs tools; the composer turns them off elsewhere. */
  showConnectors?: boolean;
  /** The conversation's agent; a saved agent's connectors switch through `disabled_mcp`. */
  agentId?: string | null;
}) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const context = useBadgeRowContext();
  const manager = context?.mcpServerManager;

  const {
    codeEnabled,
    memoryEnabled,
    webSearchEnabled,
    artifactsEnabled,
    fileSearchEnabled,
    skillsEnabled,
  } = useAgentCapabilities(context?.agentsConfig?.capabilities ?? defaultAgentCapabilities);

  const canUseWebSearch = useHasAccess({
    permissionType: PermissionTypes.WEB_SEARCH,
    permission: Permissions.USE,
  });
  const canRunCode = useHasAccess({
    permissionType: PermissionTypes.RUN_CODE,
    permission: Permissions.USE,
  });
  const canUseFileSearch = useHasAccess({
    permissionType: PermissionTypes.FILE_SEARCH,
    permission: Permissions.USE,
  });
  const canUseMcp = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.USE,
  });
  const canUseSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  const canUseMemory = useHasMemoryAccess();

  const servers: MCPServerDefinition[] = useMemo(
    () => (canUseMcp && showConnectors ? (manager?.selectableServers ?? []) : []),
    [canUseMcp, showConnectors, manager?.selectableServers],
  );
  const catalogServerNames = useMemo(() => servers.map((server) => server.serverName), [servers]);
  const agentConnectors = useAgentConnectorSelection({
    conversationId: context?.conversationId,
    agentId,
    catalogServerNames,
  });

  const { skills, memory, webSearch, artifacts, fileSearch, codeInterpreter, searchApiKeyForm } =
    context ?? {};
  const webSearchAuthTypes = webSearch?.authData?.authTypes;
  const showWebSearchSettings = useMemo(() => {
    const authTypes = webSearchAuthTypes ?? [];
    if (authTypes.length === 0) {
      return true;
    }
    return !authTypes.every(([, authType]) => authType === AuthType.SYSTEM_DEFINED);
  }, [webSearchAuthTypes]);

  const builtinTools: BuiltinTool[] = [];
  if (showBuiltinTools) {
    if (fileSearchEnabled && canUseFileSearch && fileSearch) {
      builtinTools.push({
        id: 'file-search',
        label: localize('com_assistants_file_search'),
        icon: <VectorIcon className="size-4" />,
        enabled: fileSearch.isToolEnabled,
        onToggle: () => fileSearch.debouncedChange({ value: !fileSearch.toggleState }),
      });
    }
    if (canUseWebSearch && webSearchEnabled && webSearch) {
      builtinTools.push({
        id: 'web-search',
        label: localize('com_ui_web_search'),
        icon: <Globe className="size-4" aria-hidden="true" />,
        enabled: webSearch.isToolEnabled,
        onToggle: () => webSearch.debouncedChange({ value: !webSearch.toggleState }),
        accessory: showWebSearchSettings ? (
          <button
            type="button"
            ref={searchApiKeyForm?.menuTriggerRef}
            aria-label={localize('com_ui_add_web_search_api_keys')}
            onClick={(e) => {
              e.stopPropagation();
              searchApiKeyForm?.setIsDialogOpen(true);
            }}
            className="rounded-theme-control p-1 text-text-secondary hover:bg-surface-hover-alt hover:text-text-primary"
          >
            <Settings className="size-4" aria-hidden="true" />
          </button>
        ) : undefined,
      });
    }
    if (canUseSkills && skillsEnabled && skills) {
      builtinTools.push({
        id: 'skills',
        label: localize('com_ui_skills'),
        icon: <ScrollText className="size-4" aria-hidden="true" />,
        enabled: skills.isToolEnabled,
        onToggle: () => skills.debouncedChange({ value: !skills.toggleState }),
      });
    }
    if (
      canUseMemory &&
      memoryEnabled &&
      user?.personalization?.memories !== false &&
      memory != null
    ) {
      builtinTools.push({
        id: 'memory',
        label: localize('com_ui_memory'),
        icon: <Brain className="size-4" aria-hidden="true" />,
        enabled: memory.isToolEnabled,
        onToggle: () => memory.debouncedChange({ value: !memory.toggleState }),
      });
    }
    if (canRunCode && codeEnabled && codeInterpreter) {
      builtinTools.push({
        id: 'run-code',
        label: localize('com_ui_run_code'),
        icon: <TerminalSquareIcon className="size-4" aria-hidden="true" />,
        enabled: codeInterpreter.isToolEnabled,
        onToggle: () => codeInterpreter.debouncedChange({ value: !codeInterpreter.toggleState }),
      });
    }
    if (artifactsEnabled && artifacts) {
      builtinTools.push({
        id: 'artifacts',
        label: localize('com_ui_artifacts'),
        icon: <Box className="size-4" aria-hidden="true" />,
        enabled: artifacts.isToolEnabled,
        onToggle: () =>
          artifacts.debouncedChange({
            value: artifacts.isToolEnabled ? '' : ArtifactModes.DEFAULT,
          }),
      });
    }
  }

  const selectedServerNames = useMemo(
    () => new Set(manager?.mcpValues ?? []),
    [manager?.mcpValues],
  );
  const { isSavedAgent, agentServerNames } = agentConnectors;
  /* A saved agent switches only the connectors it carries; the chat selection
     (`mcp`) belongs to ephemeral agents and would not reach its tools. */
  const isConnectorOn = isSavedAgent
    ? agentConnectors.isEnabled
    : (serverName: string) => selectedServerNames.has(serverName);
  const toggleConnector = isSavedAgent
    ? agentConnectors.toggle
    : (manager?.toggleServerSelection ?? (() => undefined));
  const switchableServers = isSavedAgent
    ? servers.filter((server) => agentServerNames.has(server.serverName))
    : servers;
  const unavailableServers = isSavedAgent
    ? servers.filter((server) => !agentServerNames.has(server.serverName))
    : [];
  /** Counts what the menu offers, never the raw selection: a selected name the
   *  catalog has not returned renders no row and cannot be turned off here. */
  const enabledCount =
    switchableServers.filter((server) => isConnectorOn(server.serverName)).length +
    builtinTools.filter((tool) => tool.enabled).length;

  return {
    manager,
    servers,
    switchableServers,
    unavailableServers,
    builtinTools,
    isConnectorOn,
    toggleConnector,
    enabledCount,
  };
}
