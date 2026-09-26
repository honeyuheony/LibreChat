import { Monitor } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
import { Button, Spinner } from '@librechat/client';
import { Constants, SystemRoles } from 'librechat-data-provider';
import type { DeskStatusResponse, MCPOptions } from 'librechat-data-provider';
import type { MCPServerStatusIconProps } from '~/components/MCP/MCPServerStatusIcon';
import type { MCPServerDefinition, TranslationKeys } from '~/hooks';
import type { HubStatus } from '../status';
import { actionLabelKeys, primaryActions, runConnectorAction } from '../actions';
import { DESK_DOWNLOAD_PATH, getConnectorState, hubStatusView } from '../status';
import { useAuthContext, useLocalize } from '~/hooks';
import { ephemeralAgentByConvoId } from '~/store';
import useNewChat from '~/hooks/Chat/useNewChat';
import ToolChips from './ToolChips';
import ConnectorIcon from '../Icon';
import StatusPill from '../Pill';

type Localize = ReturnType<typeof useLocalize>;

interface DetailProps {
  server: MCPServerDefinition;
  isDesk: boolean;
  status: HubStatus;
  statusProps: MCPServerStatusIconProps;
  deskStatus?: DeskStatusResponse;
  onConnect: (serverName: string) => void;
  onDisconnect: (serverName: string) => void;
}

const overviewRows: Array<[keyof NonNullable<MCPOptions['overview']>, TranslationKeys]> = [
  ['period', 'com_ui_data_hub_overview_period'],
  ['refresh', 'com_ui_data_hub_overview_refresh'],
  ['size', 'com_ui_data_hub_overview_size'],
  ['contact', 'com_ui_data_hub_overview_contact'],
];

/** One line per connector: whose account the connector reads with. */
function describeScope(
  server: MCPServerDefinition,
  isDesk: boolean,
  hasCustomUserVars: boolean,
  deskStatus: DeskStatusResponse | undefined,
  localize: Localize,
): string {
  if (isDesk) {
    return deskStatus?.state === 'online'
      ? localize('com_ui_data_hub_scope_desk_online', { 0: String(deskStatus.folders.length) })
      : localize('com_ui_data_hub_scope_desk_offline');
  }
  if (server.config.requiresOAuth === true || server.config.oauth != null) {
    return localize('com_ui_data_hub_scope_oauth');
  }
  if (hasCustomUserVars) {
    return localize('com_ui_data_hub_scope_user_vars');
  }
  return localize('com_ui_data_hub_scope_shared');
}

function describeAuth(
  server: MCPServerDefinition,
  hasCustomUserVars: boolean,
  localize: Localize,
): string {
  if (server.config.requiresOAuth === true || server.config.oauth != null) {
    return localize('com_ui_data_hub_admin_auth_oauth');
  }
  if (hasCustomUserVars) {
    return localize('com_ui_data_hub_admin_auth_user_vars');
  }
  return localize('com_ui_data_hub_admin_auth_shared');
}

function SectionHeading({ children }: { children: string }) {
  return <h3 className="mb-2 mt-6 px-1 text-sm font-semibold text-text-secondary">{children}</h3>;
}

export default function ConnectorDetail({
  server,
  isDesk,
  status,
  statusProps,
  deskStatus,
  onConnect,
  onDisconnect,
}: DetailProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { startNewChat } = useNewChat();
  const setNewChatAgent = useSetRecoilState(ephemeralAgentByConvoId(Constants.NEW_CONVO));
  const { serverStatus, isInitializing, canCancel, hasCustomUserVars = false } = statusProps;
  const state = getConnectorState({ serverStatus, isInitializing, canCancel, hasCustomUserVars });
  const displayName = server.config.title || server.serverName;
  const description = server.config.description?.trim();
  const isConnected =
    serverStatus?.connectionState === 'connected' || serverStatus?.requestScoped === true;
  const view = hubStatusView[status];
  const offerDownload = isDesk && status !== 'available' && !!deskStatus?.installerUrl;
  const showConnectorAction = !isDesk && state.action !== 'details';
  const overview = overviewRows.flatMap(([key, labelKey]) => {
    const value = server.config.overview?.[key]?.trim();
    return value ? [{ key, label: localize(labelKey), value }] : [];
  });
  const url = 'url' in server.config ? server.config.url : undefined;

  return (
    <section
      aria-labelledby="data-hub-detail-name"
      className="rounded-theme-surface border border-border-light bg-surface-primary p-5"
    >
      <div className="flex items-center gap-3.5">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-theme-control bg-surface-tertiary text-lg font-bold text-text-secondary"
          aria-hidden="true"
        >
          {isDesk ? (
            <Monitor className="size-6" strokeWidth={1.8} />
          ) : (
            <ConnectorIcon server={server} />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="data-hub-detail-name" className="truncate text-xl font-bold text-text-primary">
            {displayName}
          </h2>
          <p className="text-sm text-text-secondary">
            {description || localize('com_ui_mcp_detail_no_description')}
          </p>
        </div>
        <StatusPill
          tone={view.tone}
          label={localize(view.labelKey)}
          withDot={view.tone === 'success'}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {status === 'available' && (
          <Button
            size="sm"
            shape="theme"
            variant="submit"
            data-testid="data-hub-new-chat"
            onClick={() => {
              startNewChat();
              /* The chat's connector switch (ToolsMenu) is on unless listed in disabled_mcp. */
              setNewChatAgent((prev) => ({
                ...(prev ?? {}),
                disabled_mcp: (prev?.disabled_mcp ?? []).filter(
                  (name) => name !== server.serverName,
                ),
              }));
            }}
          >
            {localize('com_ui_data_hub_new_chat')}
          </Button>
        )}
        {showConnectorAction && (
          <Button
            size="sm"
            shape="theme"
            variant={primaryActions.has(state.action) ? 'submit' : 'outline'}
            onClick={(event) =>
              runConnectorAction(event, {
                action: state.action,
                serverName: server.serverName,
                statusProps,
                isConnected,
                onConnect,
                onDisconnect,
                onDetails: () => undefined,
              })
            }
          >
            {state.action === 'cancel' && <Spinner className="size-3.5" aria-hidden="true" />}
            {state.action !== 'details' && localize(actionLabelKeys[state.action])}
          </Button>
        )}
        {offerDownload && (
          <Button asChild size="sm" shape="theme" variant="submit">
            <a href={DESK_DOWNLOAD_PATH} target="_blank" rel="noopener noreferrer">
              {localize('com_ui_connectors_desk_download')}
            </a>
          </Button>
        )}
      </div>

      <SectionHeading>{localize('com_ui_data_hub_scope')}</SectionHeading>
      <p className="rounded-theme-control bg-surface-secondary px-3.5 py-3 text-sm text-text-primary">
        {describeScope(server, isDesk, hasCustomUserVars, deskStatus, localize)}
      </p>

      {overview.length > 0 && (
        <>
          <SectionHeading>{localize('com_ui_data_hub_overview')}</SectionHeading>
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {overview.map((row) => (
              <div
                key={row.key}
                className="flex min-w-0 flex-col gap-0.5 rounded-theme-control border border-border-light px-3 py-2.5"
              >
                <dt className="text-xs text-text-secondary">{row.label}</dt>
                <dd className="break-words text-sm font-medium text-text-primary">{row.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <SectionHeading>{localize('com_ui_data_hub_abilities')}</SectionHeading>
      <ToolChips serverName={server.serverName} isConnected={isConnected} />

      <p className="mt-5 px-1 text-xs leading-relaxed text-text-secondary">
        {localize('com_ui_data_hub_footnote')}
      </p>

      {user?.role === SystemRoles.ADMIN && (
        <details className="mt-3 px-1 text-sm">
          <summary className="cursor-pointer text-text-secondary">
            {localize('com_ui_data_hub_admin_info')}
          </summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-text-secondary">{localize('com_ui_data_hub_admin_transport')}</dt>
            <dd className="text-text-primary">{server.config.type ?? 'stdio'}</dd>
            {url && (
              <>
                <dt className="text-text-secondary">{localize('com_ui_data_hub_admin_address')}</dt>
                <dd className="break-all font-mono text-text-primary">{url}</dd>
              </>
            )}
            <dt className="text-text-secondary">{localize('com_ui_data_hub_admin_auth')}</dt>
            <dd className="text-text-primary">
              {describeAuth(server, hasCustomUserVars, localize)}
            </dd>
          </dl>
        </details>
      )}
    </section>
  );
}
