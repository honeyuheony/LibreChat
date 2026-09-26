import { useState, memo, useRef } from 'react';
import { useSetAtom } from 'jotai';
import * as Menu from '@ariakit/react/menu';
import { SettingsTabValues } from 'librechat-data-provider';
import { DropdownMenuSeparator, Avatar } from '@librechat/client';
import type { TFile } from 'librechat-data-provider';
import { ArchivedChatsModal } from '~/components/Nav/SettingsTabs/General/ArchivedChatsModal';
import { useGetFiles, useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { MyFilesModal } from '~/components/Chat/Input/Files/MyFilesModal';
import { useDeskStatusQuery } from '~/data-provider/Connectors/queries';
import { DESK_DOWNLOAD_PATH } from '~/components/Connectors/status';
import { settingsDialogTabAtom } from './Settings/state';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';

/** The wireframe marks each menu row with a small text glyph instead of an icon. */
const GLYPHS = {
  files: '▤',
  archived: '▦',
  settings: '⚙',
  desk: '▭',
  logout: '↪',
  open: '▾',
  closed: '▴',
};

const itemClassName =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-theme-control px-2.5 py-2 text-left text-[14.5px] text-text-secondary outline-none hover:bg-surface-hover data-[active-item]:bg-surface-hover';

/** Storage shown beside 「내 파일」, in the wireframe's one-decimal form (e.g. 352.0 MB). */
function formatUsedSize(bytes: number): string {
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function MenuGlyph({ glyph }: { glyph: string }) {
  return (
    <span aria-hidden="true" className="w-4 text-center font-mono text-[13px] text-text-muted">
      {glyph}
    </span>
  );
}

/**
 * The account card at the sidebar's foot (name, department, organization) and its menu.
 * The menu keeps only what the app can do: files, archived chats, settings, the desktop
 * app and sign-out. 「보관한 대화」 is not in the wireframe but stays, because the title
 * menu can still archive a chat and this is the only way back to it.
 */
function AccountSettings({ collapsed = false }: { collapsed?: boolean }) {
  const localize = useLocalize();
  const { user, isAuthenticated, logout } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled,
  });
  const menu = Menu.useMenuStore({ placement: collapsed ? 'right-end' : 'top-start' });
  const isOpen = menu.useState('open');
  const { data: deskStatus } = useDeskStatusQuery({ enabled: !!isAuthenticated });
  const { data: usedBytes } = useGetFiles<number>({
    enabled: !!isAuthenticated && isOpen,
    select: (files: TFile[]) => files.reduce((sum, file) => sum + (file.bytes ?? 0), 0),
  });
  const setSettingsTab = useSetAtom(settingsDialogTabAtom);
  const [showArchived, setShowArchived] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const accountSettingsButtonRef = useRef<HTMLButtonElement>(null);

  const displayName = user?.name || user?.username || localize('com_nav_user');
  const hasAvatarImage = user?.avatar != null && user.avatar !== '';

  return (
    <Menu.MenuProvider store={menu}>
      <Menu.MenuButton
        ref={accountSettingsButtonRef}
        aria-label={localize('com_nav_account_settings')}
        data-testid="nav-user"
        className={
          collapsed
            ? 'flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-active-alt aria-[expanded=true]:bg-surface-active-alt'
            : 'flex h-auto w-full items-center gap-2 rounded-theme-control px-2 py-1.5 text-left transition-colors duration-200 hover:bg-surface-hover aria-[expanded=true]:bg-surface-hover'
        }
      >
        {hasAvatarImage ? (
          <div className={collapsed ? 'size-7 flex-shrink-0' : 'size-[26px] flex-shrink-0'}>
            <Avatar user={user} size={collapsed ? 28 : 26} />
          </div>
        ) : (
          <span
            aria-hidden="true"
            className="flex size-[26px] flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#db2777] text-[13px] text-white"
          >
            {displayName.slice(0, 1)}
          </span>
        )}
        {!collapsed && (
          <>
            <div className="flex min-w-0 grow flex-col text-sm text-text-tertiary">
              <span className="truncate">{displayName}</span>
              {user?.department && <span className="truncate">{user.department}</span>}
              {user?.organization && (
                <span className="truncate text-[11px] opacity-75">{user.organization}</span>
              )}
            </div>
            <span aria-hidden="true" className="flex-shrink-0 text-xs text-text-tertiary">
              {isOpen ? GLYPHS.open : GLYPHS.closed}
            </span>
          </>
        )}
      </Menu.MenuButton>
      <Menu.Menu
        portal
        gutter={6}
        className="account-settings-popover popover-ui z-[125] w-[240px] rounded-theme-surface p-1.5"
        style={{ transformOrigin: collapsed ? 'left bottom' : 'bottom' }}
      >
        {startupConfig?.balance?.enabled === true && balanceQuery.data != null && (
          <>
            <div className="ml-3 mr-2 py-2 text-sm text-text-secondary" role="note">
              {localize('com_nav_balance')}:{' '}
              {new Intl.NumberFormat().format(Math.round(balanceQuery.data.tokenCredits))}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <Menu.MenuItem onClick={() => setShowFiles(true)} className={itemClassName}>
          <MenuGlyph glyph={GLYPHS.files} />
          <span className="flex-1">{localize('com_nav_my_files')}</span>
          {usedBytes != null && usedBytes > 0 && (
            <span className="text-xs text-text-muted">{formatUsedSize(usedBytes)}</span>
          )}
        </Menu.MenuItem>
        <Menu.MenuItem onClick={() => setShowArchived(true)} className={itemClassName}>
          <MenuGlyph glyph={GLYPHS.archived} />
          {localize('com_nav_archived_chats')}
        </Menu.MenuItem>
        <Menu.MenuItem
          onClick={() => setSettingsTab(SettingsTabValues.GENERAL)}
          className={itemClassName}
          data-testid="nav-settings"
        >
          <MenuGlyph glyph={GLYPHS.settings} />
          {localize('com_nav_settings')}
        </Menu.MenuItem>
        <Menu.MenuItem
          onClick={() => window.open(DESK_DOWNLOAD_PATH, '_blank', 'noopener,noreferrer')}
          className={itemClassName}
        >
          <MenuGlyph glyph={GLYPHS.desk} />
          <span className="flex-1">{localize('com_nav_desk_app')}</span>
          {deskStatus?.state === 'online' && (
            <span className="text-xs text-text-muted">
              {localize('com_nav_desk_app_connected')}
            </span>
          )}
        </Menu.MenuItem>
        <DropdownMenuSeparator />
        <Menu.MenuItem onClick={() => logout()} className={itemClassName}>
          <MenuGlyph glyph={GLYPHS.logout} />
          {localize('com_nav_log_out')}
        </Menu.MenuItem>
      </Menu.Menu>
      {showFiles && (
        <MyFilesModal
          open={showFiles}
          onOpenChange={setShowFiles}
          triggerRef={accountSettingsButtonRef}
        />
      )}
      {showArchived && (
        <ArchivedChatsModal
          open={showArchived}
          onOpenChange={setShowArchived}
          triggerRef={accountSettingsButtonRef}
        />
      )}
    </Menu.MenuProvider>
  );
}

export default memo(AccountSettings);
