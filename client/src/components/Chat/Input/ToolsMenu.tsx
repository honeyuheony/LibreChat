import React, { memo, useRef, useMemo, useEffect } from 'react';
import { Plus } from 'lucide-react';
import * as Ariakit from '@ariakit/react';
import { useNavigate } from 'react-router-dom';
import { TooltipAnchor } from '@librechat/client';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ComposerUpload } from './ToolRows';
import type { MenuItemProps } from '~/common';
import {
  BuiltinRow,
  UploadRows,
  ConnectorRow,
  UploadPickerRow,
  ConversationFilesRow,
  UnavailableConnectorRow,
} from './ToolRows';
import useConversationFilesSwitch, { countUploadedFiles } from './useConversationFilesSwitch';
import { DATA_HUB_PATH, DESK_SERVER_NAME } from '~/components/Connectors/status';
import { useDeskStatusQuery } from '~/data-provider/Connectors/queries';
import MCPConfigDialog from '~/components/MCP/MCPConfigDialog';
import { useMCPRefresh } from '~/hooks/MCP/useMCPRefresh';
import useComposerTools from './useComposerTools';
import { useBadgeRowContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/** 접근성 랜드마크를 유지하려 메뉴를 main 안에 두고, 없으면 body에 렌더링한다. */
const getMainLandmark = () => document.querySelector<HTMLElement>('main') ?? document.body;

const sectionLabelClassName = 'px-2.5 pb-1 pt-2 text-xs font-normal text-text-muted';

function ToolsMenu({
  showBuiltinTools,
  showConnectors = true,
  agentId,
  uploadItems = [],
  upload,
  attachedFileCount = 0,
  disabled = false,
  anchorRef,
}: {
  showBuiltinTools: boolean;
  showConnectors?: boolean;
  agentId?: string | null;
  uploadItems?: MenuItemProps[];
  /** 파일·폴더를 고르는 단추 한 줄. 없으면 `uploadItems` 만 보인다. */
  upload?: ComposerUpload;
  /** 아직 보내지 않고 입력창에 붙어 있는 파일 수 */
  attachedFileCount?: number;
  disabled?: boolean;
  /** 메뉴를 붙일 입력창 표면. 없으면 ＋ 단추에 붙는다. */
  anchorRef?: React.RefObject<HTMLElement>;
}) {
  const localize = useLocalize();
  const context = useBadgeRowContext();
  const {
    manager,
    servers,
    switchableServers,
    unavailableServers,
    builtinTools,
    isConnectorOn,
    toggleConnector,
    enabledCount,
  } = useComposerTools({ showBuiltinTools, showConnectors, agentId });

  const myFiles = useConversationFilesSwitch(context?.conversationId);

  const navigate = useNavigate();
  const menuStore = Ariakit.useMenuStore({ focusLoop: true, placement: 'top-start' });
  const isOpen = menuStore.useState('open');
  const queryClient = useQueryClient();
  const convoKey = context?.conversationId ?? Constants.NEW_CONVO;
  /* 메뉴를 열 때만 메시지 캐시를 읽어, 입력창이 다시 그려질 때마다 메시지를 훑지 않는다. */
  const myFilesCount = useMemo(
    () =>
      isOpen
        ? countUploadedFiles(queryClient.getQueryData<TMessage[]>([QueryKeys.messages, convoKey])) +
          attachedFileCount
        : 0,
    [isOpen, queryClient, convoKey, attachedFileCount],
  );
  const openDataHub = (serverName: string) => {
    menuStore.hide();
    navigate(`${DATA_HUB_PATH}/${encodeURIComponent(serverName)}`);
  };

  const hasDeskConnector = servers.some((server) => server.serverName === DESK_SERVER_NAME);
  const { data: deskStatus } = useDeskStatusQuery({ enabled: hasDeskConnector && isOpen });
  const configDialogOpen = manager?.getConfigDialogProps()?.isOpen === true;
  useMCPRefresh({ enabled: (isOpen || configDialogOpen) && servers.length > 0 });

  /** 연결 설정 창이 닫혀도 Ariakit 메뉴가 남으므로, 창을 닫을 때 메뉴도 닫는다. */
  const configDialogWasOpen = useRef(false);
  useEffect(() => {
    if (configDialogWasOpen.current && !configDialogOpen) {
      menuStore.hide();
    }
    configDialogWasOpen.current = configDialogOpen;
  }, [configDialogOpen, menuStore]);

  const hasUploads =
    upload != null || uploadItems.some((item) => item.separate !== true && item.show !== false);
  const hasSources = hasUploads || (servers.length > 0 && manager != null);
  if (builtinTools.length === 0 && servers.length === 0 && !hasUploads) {
    return null;
  }

  const configDialogProps = manager?.getConfigDialogProps();
  const menuLabel = localize(hasUploads ? 'com_ui_composer_plus' : 'com_ui_tools');
  const triggerLabel =
    enabledCount > 0
      ? `${menuLabel}, ${localize('com_ui_tools_enabled_count', { 0: enabledCount })}`
      : menuLabel;

  return (
    <>
      <Ariakit.MenuProvider store={menuStore}>
        <TooltipAnchor
          description={menuLabel}
          disabled={isOpen}
          render={
            <Ariakit.MenuButton
              id="tools-menu-button"
              data-testid="tools-menu-button"
              disabled={disabled}
              aria-label={triggerLabel}
              className={cn(
                'relative inline-flex size-[38px] flex-shrink-0 items-center justify-center rounded-full border border-border-light',
                'text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-opacity-50',
                'disabled:cursor-not-allowed disabled:opacity-50',
                isOpen &&
                  'border-text-primary bg-text-primary text-surface-primary hover:bg-text-primary hover:text-surface-primary',
              )}
            />
          }
        >
          <Plus className="size-5" aria-hidden="true" />
          {enabledCount > 0 && (
            <span
              aria-hidden="true"
              data-testid="tools-menu-count"
              className="absolute -right-[5px] -top-[5px] flex h-4 min-w-4 items-center justify-center rounded-full bg-[#6d28d9] px-1 font-mono text-[11px] leading-none text-white"
            >
              {enabledCount}
            </span>
          )}
        </TooltipAnchor>
        <Ariakit.Menu
          portal={true}
          portalElement={getMainLandmark}
          getAnchorRect={() => anchorRef?.current?.getBoundingClientRect() ?? null}
          gutter={7}
          flip={false}
          modal={false}
          unmountOnHide={true}
          aria-label={menuLabel}
          className={cn(
            'z-50 flex max-h-[min(420px,var(--popover-available-height))] w-[340px] max-w-[calc(100vw-2rem)] flex-col rounded-theme-surface',
            'border border-border-light bg-surface-primary p-1.5 shadow-lg',
            'origin-bottom-left opacity-0 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
            'data-[enter]:scale-100 data-[enter]:opacity-100',
            'scale-95 data-[leave]:scale-95 data-[leave]:opacity-0',
          )}
        >
          <div className="flex min-h-0 flex-col overflow-y-auto">
            {hasUploads && (
              <Ariakit.MenuGroup
                aria-label={upload ? localize('com_sidepanel_attach_files') : undefined}
              >
                {upload ? (
                  <UploadPickerRow upload={upload} />
                ) : (
                  <Ariakit.MenuGroupLabel className={sectionLabelClassName}>
                    {localize('com_sidepanel_attach_files')}
                  </Ariakit.MenuGroupLabel>
                )}
                <UploadRows items={uploadItems} />
              </Ariakit.MenuGroup>
            )}
            {hasUploads && <Ariakit.MenuSeparator className="my-1 border-border-light" />}
            {hasSources && (
              <Ariakit.MenuGroup>
                <Ariakit.MenuGroupLabel className={sectionLabelClassName}>
                  {localize('com_ui_tools_data_sources')}
                </Ariakit.MenuGroupLabel>
                {hasUploads && (
                  <ConversationFilesRow
                    count={myFilesCount}
                    included={myFiles.included}
                    onToggle={myFiles.toggle}
                  />
                )}
                {manager &&
                  switchableServers.map((server) => (
                    <ConnectorRow
                      key={server.serverName}
                      server={server}
                      isSelected={isConnectorOn(server.serverName)}
                      connectionStatus={manager.connectionStatus}
                      statusIconProps={manager.getServerStatusIconProps(server.serverName)}
                      onToggle={toggleConnector}
                      onOpenDataHub={openDataHub}
                      deskAppOff={
                        server.serverName === DESK_SERVER_NAME && deskStatus?.state === 'offline'
                      }
                    />
                  ))}
                {manager &&
                  unavailableServers.map((server) => (
                    <UnavailableConnectorRow key={server.serverName} server={server} />
                  ))}
              </Ariakit.MenuGroup>
            )}
            {hasSources && builtinTools.length > 0 && (
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
