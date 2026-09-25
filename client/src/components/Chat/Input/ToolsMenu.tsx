import React, { memo, useRef, useMemo, useEffect } from 'react';
import { useSetAtom } from 'jotai';
import * as Ariakit from '@ariakit/react';
import { MCPIcon, VectorIcon, TooltipAnchor } from '@librechat/client';
import {
  Box,
  Brain,
  Globe,
  Settings,
  ScrollText,
  SlidersHorizontal,
  TerminalSquareIcon,
} from 'lucide-react';
import {
  AuthType,
  Permissions,
  ArtifactModes,
  PermissionTypes,
  SettingsTabValues,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { MCPServerStatusIconProps } from '~/components/MCP/MCPServerStatusIcon';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';
import type { ConnectionStatusMap } from '~/components/MCP/mcpServerUtils';
import {
  useLocalize,
  useHasAccess,
  useAuthContext,
  useHasMemoryAccess,
  useAgentCapabilities,
} from '~/hooks';
import { DESK_SERVER_NAME, DESK_DOWNLOAD_PATH } from '~/components/Connectors/status';
import { useDeskStatusQuery } from '~/data-provider/Connectors/queries';
import { settingsDialogTabAtom } from '~/components/Nav/Settings/state';
import useAgentConnectorSelection from './useAgentConnectorSelection';
import { serverNeedsAction } from '~/components/MCP/mcpServerUtils';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { useMCPRefresh } from '~/hooks/MCP/useMCPRefresh';
import CustomIcon from '~/components/ui/CustomIcon';
import { useBadgeRowContext } from '~/Providers';
import { cn } from '~/utils';

interface BuiltinTool {
  id: string;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
  onToggle: () => void;
  /** An extra control drawn beside the switch, such as the web search key settings. */
  accessory?: React.ReactNode;
}

/** Portals into the page's `main` landmark so the menu stays inside one; `body` where there is none. */
const getMainLandmark = () => document.querySelector<HTMLElement>('main') ?? document.body;

const sectionLabelClassName = 'px-2.5 pb-1 pt-2 text-xs font-semibold text-text-tertiary';

const rowClassName = cn(
  'group flex w-full cursor-pointer items-center gap-3 rounded-theme-control px-2.5 py-2',
  'outline-none transition-colors duration-150',
  'hover:bg-surface-hover data-[active-item]:bg-surface-hover',
);

function SwitchIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-testid="tools-menu-switch"
      data-state={checked ? 'checked' : 'unchecked'}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-surface-submit' : 'bg-switch-unchecked',
      )}
    >
      <span
        className={cn(
          'block size-4 rounded-full bg-surface-primary shadow-sm transition-transform motion-reduce:transition-none',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </span>
  );
}

function ConnectorRow({
  server,
  isSelected,
  connectionStatus,
  statusIconProps,
  onToggle,
  onOpenConnectorsSettings,
  deskAppOff = false,
}: {
  server: MCPServerDefinition;
  isSelected: boolean;
  connectionStatus?: ConnectionStatusMap;
  statusIconProps?: MCPServerStatusIconProps | null;
  onToggle: (serverName: string) => void;
  onOpenConnectorsSettings: () => void;
  /** 「내 PC 폴더」 only: the relay sees no running desktop app for this user. */
  deskAppOff?: boolean;
}) {
  const localize = useLocalize();
  const displayName = server.config?.title || server.serverName;
  const needsConnection = serverNeedsAction(
    connectionStatus?.[server.serverName],
    statusIconProps?.hasCustomUserVars,
  );

  return (
    <Ariakit.MenuItemCheckbox
      hideOnClick={false}
      name="tools-menu-connectors"
      value={server.serverName}
      checked={isSelected}
      onChange={() => onToggle(server.serverName)}
      aria-label={
        needsConnection ? `${displayName}, ${localize('com_ui_connection_required')}` : displayName
      }
      className={rowClassName}
    >
      {server.config?.iconPath ? (
        <CustomIcon
          src={server.config.iconPath}
          className="size-8 flex-shrink-0 rounded-theme-control object-cover text-text-primary"
          alt=""
        />
      ) : (
        <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-theme-control bg-surface-brand-subtle">
          <MCPIcon className="size-4 text-accent-primary" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">{displayName}</span>
        {deskAppOff ? (
          <span className="block truncate text-xs text-text-secondary">
            {localize('com_ui_tools_desk_app_off')}
          </span>
        ) : (
          server.config?.description && (
            <span className="block truncate text-xs text-text-secondary">
              {server.config.description}
            </span>
          )
        )}
      </span>
      {deskAppOff && (
        <button
          type="button"
          data-testid="tools-menu-desk-download"
          onClick={(e) => {
            e.stopPropagation();
            window.open(DESK_DOWNLOAD_PATH, '_blank', 'noopener,noreferrer');
          }}
          className="flex-shrink-0 rounded-theme-control border border-border-light px-2 py-1 text-xs font-medium text-accent-primary hover:bg-surface-brand-subtle"
        >
          {localize('com_ui_tools_desk_app_get')}
        </button>
      )}
      {needsConnection && statusIconProps ? (
        <span className="flex flex-shrink-0 items-center gap-2">
          <span className="text-xs text-text-tertiary">
            {localize('com_ui_connection_required')}
          </span>
          <button
            type="button"
            data-testid="tools-menu-connect"
            onClick={(e) => {
              e.stopPropagation();
              onOpenConnectorsSettings();
            }}
            className="rounded-theme-control border border-border-light px-2 py-1 text-xs font-medium text-accent-primary hover:bg-surface-brand-subtle"
          >
            {localize('com_ui_connect')}
          </button>
        </span>
      ) : (
        <SwitchIndicator checked={isSelected} />
      )}
    </Ariakit.MenuItemCheckbox>
  );
}

/** A connector the conversation's saved agent does not carry: listed so the user
 *  knows it exists, but it has no switch because the agent cannot use it. */
function UnavailableConnectorRow({ server }: { server: MCPServerDefinition }) {
  const localize = useLocalize();
  const displayName = server.config?.title || server.serverName;
  const reason = localize('com_ui_connector_unavailable_for_agent');
  return (
    <Ariakit.MenuItem
      disabled
      aria-label={`${displayName}, ${reason}`}
      data-testid="tools-menu-unavailable"
      className={cn(rowClassName, 'cursor-default opacity-50 hover:bg-transparent')}
    >
      <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-theme-control bg-surface-hover">
        <MCPIcon className="size-4 text-text-tertiary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">{displayName}</span>
        <span className="block truncate text-xs text-text-secondary">{reason}</span>
      </span>
    </Ariakit.MenuItem>
  );
}

function BuiltinRow({ tool }: { tool: BuiltinTool }) {
  return (
    <Ariakit.MenuItemCheckbox
      hideOnClick={false}
      name="tools-menu-builtin"
      value={tool.id}
      checked={tool.enabled}
      onChange={tool.onToggle}
      aria-label={tool.label}
      data-testid={`tools-menu-${tool.id}`}
      className={rowClassName}
    >
      <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-theme-control bg-surface-hover text-text-secondary">
        {tool.icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
        {tool.label}
      </span>
      {tool.accessory}
      <SwitchIndicator checked={tool.enabled} />
    </Ariakit.MenuItemCheckbox>
  );
}

/**
 * The composer's one tools control: connectors (MCP servers) and the built-in
 * tool toggles in a single popover, with the number of tools turned on shown
 * on the trigger.
 */
function ToolsMenu({
  showBuiltinTools,
  agentId,
  disabled = false,
}: {
  /** Built-in toggles only reach the model on endpoints that build an ephemeral agent. */
  showBuiltinTools: boolean;
  /** The conversation's agent; a saved agent's connectors switch through `disabled_mcp`. */
  agentId?: string | null;
  disabled?: boolean;
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

  const setSettingsTab = useSetAtom(settingsDialogTabAtom);
  const menuStore = Ariakit.useMenuStore({ focusLoop: true, placement: 'top-start' });
  const isOpen = menuStore.useState('open');
  const openConnectorsSettings = () => {
    setSettingsTab(SettingsTabValues.CONNECTORS);
    menuStore.hide();
  };

  const servers = useMemo(
    () => (canUseMcp ? (manager?.selectableServers ?? []) : []),
    [canUseMcp, manager?.selectableServers],
  );
  const hasDeskConnector = servers.some((server) => server.serverName === DESK_SERVER_NAME);
  const { data: deskStatus } = useDeskStatusQuery({ enabled: hasDeskConnector && isOpen });
  const catalogServerNames = useMemo(() => servers.map((server) => server.serverName), [servers]);
  const agentConnectors = useAgentConnectorSelection({
    conversationId: context?.conversationId,
    agentId,
    catalogServerNames,
  });
  const configDialogOpen = manager?.getConfigDialogProps()?.isOpen === true;
  useMCPRefresh({ enabled: (isOpen || configDialogOpen) && servers.length > 0 });

  /** Ariakit only takes Escape for a menu when the event target is the menu, its
   *  trigger, or `body`, so the Escape that closes the connect dialog leaves the
   *  menu open behind it. Closing on the dialog's close keeps the two in step. */
  const configDialogWasOpen = useRef(false);
  useEffect(() => {
    if (configDialogWasOpen.current && !configDialogOpen) {
      menuStore.hide();
    }
    configDialogWasOpen.current = configDialogOpen;
  }, [configDialogOpen, menuStore]);

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

  if (builtinTools.length === 0 && servers.length === 0) {
    return null;
  }

  const configDialogProps = manager?.getConfigDialogProps();
  const triggerLabel =
    enabledCount > 0
      ? `${localize('com_ui_tools')}, ${localize('com_ui_tools_enabled_count', { 0: enabledCount })}`
      : localize('com_ui_tools');

  return (
    <>
      <Ariakit.MenuProvider store={menuStore}>
        <TooltipAnchor
          description={localize('com_ui_tools')}
          disabled={isOpen}
          render={
            <Ariakit.MenuButton
              id="tools-menu-button"
              data-testid="tools-menu-button"
              disabled={disabled}
              aria-label={triggerLabel}
              className={cn(
                'inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-theme-control border border-border-light px-3',
                'text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-opacity-50',
                'disabled:cursor-not-allowed disabled:opacity-50',
                isOpen && 'bg-surface-hover text-text-primary',
              )}
            />
          }
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          <span>{localize('com_ui_tools')}</span>
          {enabledCount > 0 && (
            <span
              aria-hidden="true"
              data-testid="tools-menu-count"
              className="rounded-md bg-surface-brand-subtle px-1.5 font-mono text-xs leading-5 text-accent-primary"
            >
              {enabledCount}
            </span>
          )}
        </TooltipAnchor>
        <Ariakit.Menu
          portal={true}
          portalElement={getMainLandmark}
          gutter={8}
          modal={false}
          unmountOnHide={true}
          aria-label={localize('com_ui_tools')}
          className={cn(
            'z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-theme-surface',
            'border border-border-light bg-surface-primary p-1.5 shadow-lg',
            'origin-bottom-left opacity-0 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
            'data-[enter]:scale-100 data-[enter]:opacity-100',
            'scale-95 data-[leave]:scale-95 data-[leave]:opacity-0',
          )}
        >
          <div className="flex max-h-[min(420px,var(--popover-available-height))] flex-col overflow-y-auto">
            {servers.length > 0 && manager && (
              <Ariakit.MenuGroup>
                <Ariakit.MenuGroupLabel className={sectionLabelClassName}>
                  {localize('com_ui_connectors')}
                </Ariakit.MenuGroupLabel>
                {switchableServers.map((server) => (
                  <ConnectorRow
                    key={server.serverName}
                    server={server}
                    isSelected={isConnectorOn(server.serverName)}
                    connectionStatus={manager.connectionStatus}
                    statusIconProps={manager.getServerStatusIconProps(server.serverName)}
                    onToggle={toggleConnector}
                    onOpenConnectorsSettings={openConnectorsSettings}
                    deskAppOff={
                      server.serverName === DESK_SERVER_NAME && deskStatus?.state === 'offline'
                    }
                  />
                ))}
                {unavailableServers.map((server) => (
                  <UnavailableConnectorRow key={server.serverName} server={server} />
                ))}
              </Ariakit.MenuGroup>
            )}
            {servers.length > 0 && builtinTools.length > 0 && (
              <Ariakit.MenuSeparator className="my-1 border-border-light" />
            )}
            {builtinTools.length > 0 && (
              <Ariakit.MenuGroup>
                <Ariakit.MenuGroupLabel className={sectionLabelClassName}>
                  {localize('com_ui_builtin_tools')}
                </Ariakit.MenuGroupLabel>
                {builtinTools.map((tool) => (
                  <BuiltinRow key={tool.id} tool={tool} />
                ))}
              </Ariakit.MenuGroup>
            )}
          </div>
        </Ariakit.Menu>
      </Ariakit.MenuProvider>
      {configDialogProps && (
        <MCPConfigDialog
          {...configDialogProps}
          conversationId={context?.conversationId}
          storageContextKey={context?.storageContextKey}
        />
      )}
    </>
  );
}

export default memo(ToolsMenu);
