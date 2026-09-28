import * as Ariakit from '@ariakit/react';
import { MCPIcon } from '@librechat/client';
import { Files, Upload } from 'lucide-react';
import type { MCPServerStatusIconProps } from '~/components/MCP/MCPServerStatusIcon';
import type { MCPServerDefinition } from '~/hooks/MCP/useMCPServerManager';
import type { ConnectionStatusMap } from '~/components/MCP/mcpServerUtils';
import type { BuiltinTool } from './useComposerTools';
import type { MenuItemProps } from '~/common';
import { serverNeedsAction } from '~/components/MCP/mcpServerUtils';
import { DESK_DOWNLOAD_PATH } from '~/components/Connectors/status';
import CustomIcon from '~/components/ui/CustomIcon';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

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

function ConnectorTile({
  server,
  muted = false,
}: {
  server: MCPServerDefinition;
  muted?: boolean;
}) {
  const glyphClassName = cn('size-4', muted ? 'text-text-tertiary' : 'text-accent-primary');
  return (
    <span
      className={cn(
        'flex size-8 flex-shrink-0 items-center justify-center rounded-theme-control',
        muted ? 'bg-surface-hover' : 'bg-surface-brand-subtle',
      )}
    >
      {server.config?.iconPath ? (
        <CustomIcon
          src={server.config.iconPath}
          className={cn(glyphClassName, 'object-contain')}
          alt=""
        />
      ) : (
        <MCPIcon className={glyphClassName} />
      )}
    </span>
  );
}

export function ConnectorRow({
  server,
  isSelected,
  connectionStatus,
  statusIconProps,
  onToggle,
  onOpenDataHub,
  deskAppOff = false,
}: {
  server: MCPServerDefinition;
  isSelected: boolean;
  connectionStatus?: ConnectionStatusMap;
  statusIconProps?: MCPServerStatusIconProps | null;
  onToggle: (serverName: string) => void;
  onOpenDataHub: (serverName: string) => void;
  /** 「내 PC 폴더」 connector에서 relay가 데스크톱 앱 실행 여부를 알린다. */
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
      <ConnectorTile server={server} />
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
              onOpenDataHub(server.serverName);
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

/** saved agent에서 사용할 수 없는 connector도 목록에 보이되 전환은 막는다. */
export function UnavailableConnectorRow({ server }: { server: MCPServerDefinition }) {
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
      <ConnectorTile server={server} muted />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">{displayName}</span>
        <span className="block truncate text-xs text-text-secondary">{reason}</span>
      </span>
    </Ariakit.MenuItem>
  );
}

export function BuiltinRow({ tool }: { tool: BuiltinTool }) {
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

export type ComposerUpload = {
  onPickFiles: () => void;
  onPickFolder: () => void;
  /** 허용 형식과 파일당 크기 제한처럼 현재 endpoint 파일 설정에서 만든 안내 */
  hint: string;
  disabled?: boolean;
};

const pickButtonClassName = cn(
  'flex-shrink-0 rounded-theme-control border border-border-light px-2 py-1 text-xs font-medium text-text-primary',
  'outline-none hover:bg-surface-hover data-[active-item]:bg-surface-hover',
  'aria-disabled:cursor-default aria-disabled:opacity-50',
);

export function UploadPickerRow({ upload }: { upload: ComposerUpload }) {
  const localize = useLocalize();
  return (
    <div className="flex w-full items-center gap-3 px-2.5 py-2" data-testid="tools-menu-upload">
      <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-theme-control bg-surface-hover text-text-secondary">
        <Upload className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">
          {localize('com_ui_upload_file_or_folder')}
        </span>
        {upload.hint !== '' && (
          <span className="block text-xs text-text-secondary">{upload.hint}</span>
        )}
      </span>
      <Ariakit.MenuItem
        disabled={upload.disabled}
        onClick={upload.onPickFiles}
        data-testid="tools-menu-upload-files"
        className={pickButtonClassName}
      >
        {localize('com_ui_upload_pick_files')}
      </Ariakit.MenuItem>
      <Ariakit.MenuItem
        disabled={upload.disabled}
        onClick={upload.onPickFolder}
        data-testid="tools-menu-upload-folder"
        className={pickButtonClassName}
      >
        {localize('com_ui_upload_pick_folder')}
      </Ariakit.MenuItem>
    </div>
  );
}

/** 이 대화에 올린 파일을 답의 자료로 쓸지 정한다. 개수는 입력창에 붙은 파일과 앞서 올린 파일을 합친 값이다. */
export function ConversationFilesRow({
  count,
  included,
  onToggle,
}: {
  count: number;
  included: boolean;
  onToggle: () => void;
}) {
  const localize = useLocalize();
  const label = localize('com_ui_my_uploaded_files');
  return (
    <Ariakit.MenuItemCheckbox
      hideOnClick={false}
      name="tools-menu-sources"
      value="my-files"
      checked={included}
      onChange={onToggle}
      aria-label={label}
      data-testid="tools-menu-my-files"
      className={rowClassName}
    >
      <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-theme-control bg-surface-brand-subtle text-accent-primary">
        <Files className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">{label}</span>
        <span className="block truncate text-xs text-text-secondary">
          {count > 0
            ? localize('com_ui_my_uploaded_files_count', { 0: count })
            : localize('com_ui_my_uploaded_files_empty')}
        </span>
      </span>
      <SwitchIndicator checked={included} />
    </Ariakit.MenuItemCheckbox>
  );
}

function UploadRow({ item }: { item: MenuItemProps }) {
  return (
    <Ariakit.MenuItem
      id={item.id}
      disabled={item.disabled}
      onClick={item.onClick}
      className={cn(rowClassName, 'aria-disabled:cursor-default aria-disabled:opacity-50')}
    >
      <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-theme-control bg-surface-hover text-text-secondary [&_svg]:size-4">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
        {item.label}
      </span>
    </Ariakit.MenuItem>
  );
}

export function UploadRows({ items }: { items: MenuItemProps[] }) {
  return (
    <>
      {items.map((item, index) => {
        if (item.show === false) {
          return null;
        }
        if (item.separate === true) {
          return (
            <Ariakit.MenuSeparator key={`sep-${index}`} className="my-1 border-border-light" />
          );
        }
        if (item.subItems && item.subItems.length > 0) {
          return item.subItems.map((sub, subIndex) => (
            <UploadRow key={`${index}-${subIndex}`} item={sub} />
          ));
        }
        return <UploadRow key={item.id ?? `${index}-${item.label}`} item={item} />;
      })}
    </>
  );
}
