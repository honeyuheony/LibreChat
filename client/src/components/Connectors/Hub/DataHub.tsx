import { useEffect, useMemo, useState } from 'react';
import { Monitor } from 'lucide-react';
import { useMediaQuery } from '@librechat/client';
import { useNavigate, useParams } from 'react-router-dom';
import type { MCPServerDefinition } from '~/hooks';
import type { HubStatus } from '../status';
import {
  DATA_HUB_PATH,
  DESK_SERVER_NAME,
  getHubStatus,
  hubStatusView,
  toHubStatusProps,
} from '../status';
import { useLocalize, useMCPServerManager, activateCatalog, useDocumentTitle } from '~/hooks';
import { useDeskStatusQuery } from '~/data-provider/Connectors/queries';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { useMCPRefresh } from '~/hooks/MCP/useMCPRefresh';
import RecentActivity from './RecentActivity';
import ConnectorDetail from './Detail';
import ConnectorIcon from '../Icon';
import StatusPill from '../Pill';
import { cn } from '~/utils';

type Filter = Exclude<HubStatus, 'checking'>;
const FILTERS: Filter[] = ['available', 'needs_connection', 'unavailable'];

/** Every configured connector, what the signed-in user can do with each, and recent use. */
export default function DataHub() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { serverName: selectedParam } = useParams();
  const [filter, setFilter] = useState<Filter | null>(null);
  useDocumentTitle(`${localize('com_ui_data_hub')} | LibreChat`);

  useEffect(() => {
    activateCatalog('mcpServers');
    activateCatalog('mcpTools');
  }, []);
  const {
    availableMCPServers,
    isLoading,
    initializeServer,
    isInitializing,
    revokeOAuthForServer,
    getServerStatusIconProps,
    getConfigDialogProps,
  } = useMCPServerManager({ observeToolAuthorization: true });
  useMCPRefresh({ enabled: !isLoading && availableMCPServers.length > 0 });
  const configDialogProps = getConfigDialogProps();
  const { data: deskStatus, isError: deskError } = useDeskStatusQuery();

  const servers = useMemo(() => {
    const desk = availableMCPServers.find((server) => server.serverName === DESK_SERVER_NAME);
    return desk
      ? [desk, ...availableMCPServers.filter((server) => server !== desk)]
      : availableMCPServers;
  }, [availableMCPServers]);

  const statusPropsOf = (serverName: string) =>
    toHubStatusProps(getServerStatusIconProps(serverName), isInitializing(serverName));
  const statusOf = (server: MCPServerDefinition): HubStatus => {
    const props = statusPropsOf(server.serverName);
    return getHubStatus({
      serverStatus: props.serverStatus,
      isInitializing: props.isInitializing,
      desk:
        server.serverName === DESK_SERVER_NAME
          ? { state: deskError ? 'unknown' : deskStatus?.state }
          : undefined,
    });
  };
  const statuses = new Map(servers.map((server) => [server.serverName, statusOf(server)]));
  const counts = FILTERS.map((key) => ({
    key,
    count: servers.filter((server) => statuses.get(server.serverName) === key).length,
  }));
  const visible = filter
    ? servers.filter((server) => statuses.get(server.serverName) === filter)
    : servers;
  const selected =
    servers.find((server) => server.serverName === selectedParam) ?? visible[0] ?? servers[0];

  const select = (serverName: string) =>
    navigate(`${DATA_HUB_PATH}/${encodeURIComponent(serverName)}`);

  let content = (
    <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        {filter && (
          <div className="mb-2 flex items-center justify-between px-1 text-sm text-text-secondary">
            <span>
              {localize('com_ui_data_hub_filtering', {
                0: localize(hubStatusView[filter].labelKey),
              })}
            </span>
            <button
              type="button"
              className="text-text-primary underline-offset-2 hover:underline"
              onClick={() => setFilter(null)}
            >
              {localize('com_ui_data_hub_show_all')}
            </button>
          </div>
        )}
        <ul aria-label={localize('com_ui_data_hub_list')} className="flex flex-col gap-1.5">
          {visible.map((server) => {
            const view = hubStatusView[statuses.get(server.serverName) ?? 'checking'];
            const isSelected = server === selected;
            return (
              <li key={server.serverName}>
                <button
                  type="button"
                  aria-current={isSelected ? 'true' : undefined}
                  data-testid={`data-hub-item-${server.serverName}`}
                  onClick={() => select(server.serverName)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-theme-control border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                    isSelected
                      ? 'border-border-medium bg-surface-active'
                      : 'border-transparent hover:bg-surface-hover',
                  )}
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-theme-control bg-surface-tertiary text-sm font-bold text-text-secondary"
                    aria-hidden="true"
                  >
                    {server.serverName === DESK_SERVER_NAME ? (
                      <Monitor className="size-5" strokeWidth={1.8} />
                    ) : (
                      <ConnectorIcon server={server} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-text-primary">
                      {server.config.title || server.serverName}
                    </span>
                    <span className="truncate text-xs text-text-secondary">
                      {server.config.description}
                    </span>
                  </span>
                  <StatusPill tone={view.tone} label={localize(view.labelKey)} />
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-1 py-3 text-sm text-text-secondary">
              {localize('com_ui_data_hub_none_match')}
            </li>
          )}
        </ul>
      </div>
      {selected && (
        <ConnectorDetail
          key={selected.serverName}
          server={selected}
          isDesk={selected.serverName === DESK_SERVER_NAME}
          status={statuses.get(selected.serverName) ?? 'checking'}
          statusProps={statusPropsOf(selected.serverName)}
          deskStatus={deskStatus}
          deskError={deskError}
          onConnect={initializeServer}
          onDisconnect={revokeOAuthForServer}
        />
      )}
    </div>
  );
  if (isLoading) {
    content = (
      <p role="status" aria-live="polite" className="text-sm text-text-secondary">
        {localize('com_ui_connectors_loading')}
      </p>
    );
  } else if (servers.length === 0) {
    content = (
      <p className="rounded-theme-surface border border-border-light px-4 py-8 text-center text-sm text-text-secondary">
        {localize('com_ui_connectors_empty')}
      </p>
    );
  }

  return (
    <main
      className="relative flex h-full w-full grow flex-col overflow-y-auto bg-presentation"
      data-testid="data-hub"
    >
      <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-6 md:pt-10">
        {isSmallScreen && (
          <div className="mb-3">
            <OpenSidebar />
          </div>
        )}
        <h1 className="flex items-baseline gap-2 text-2xl font-bold text-text-primary">
          {localize('com_ui_data_hub')}
          <span className="text-sm font-medium text-text-secondary">
            {localize('com_ui_data_hub_badge')}
          </span>
        </h1>
        <p className="mb-5 mt-1.5 max-w-2xl text-sm leading-relaxed text-text-secondary">
          {localize('com_ui_data_hub_description')}
        </p>
        {!isLoading && servers.length > 0 && (
          <div
            className="mb-5 grid grid-cols-3 gap-2"
            role="group"
            aria-label={localize('com_ui_data_hub_summary')}
          >
            {counts.map(({ key, count }) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                data-testid={`data-hub-filter-${key}`}
                onClick={() => setFilter((current) => (current === key ? null : key))}
                className={cn(
                  'flex flex-col items-start rounded-theme-control border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                  filter === key
                    ? 'border-border-medium bg-surface-active'
                    : 'border-border-light bg-surface-primary hover:bg-surface-hover',
                )}
              >
                <span className="text-2xl font-bold text-text-primary">{count}</span>
                <span className="text-sm text-text-secondary">
                  {localize(hubStatusView[key].labelKey)}
                </span>
              </button>
            ))}
          </div>
        )}
        {content}
        {!isLoading && servers.length > 0 && <RecentActivity servers={servers} />}
      </div>
      {configDialogProps && <MCPConfigDialog {...configDialogProps} />}
    </main>
  );
}
