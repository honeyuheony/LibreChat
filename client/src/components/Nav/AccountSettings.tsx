import { useState, memo, useRef } from 'react';
import * as Menu from '@ariakit/react/menu';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Permissions, PermissionTypes, SystemRoles } from 'librechat-data-provider';
import {
  Avatar,
  DropdownMenuSeparator,
  OGDialog,
  OGDialogTemplate,
  useToastContext,
} from '@librechat/client';
import type { TFile } from 'librechat-data-provider';
import {
  useDemoResetMutation,
  useDemoSwitchUserMutation,
  useDemoSwitchUserQuery,
} from '~/data-provider/Demo';
import { MyFilesModal } from '~/components/Chat/Input/Files/MyFilesModal';
import { DESK_DOWNLOAD_PATH } from '~/components/Connectors/status';
import { useGetFiles, useGetStartupConfig } from '~/data-provider';
import { useSchedulesQuery } from '~/data-provider/Schedules';
import { isSchedulesEnabled } from '~/hooks/Nav/schedules';
import { useAuthContext } from '~/hooks/AuthContext';
import { useHasAccess, useLocalize } from '~/hooks';

const GLYPHS = {
  files: '▤',
  schedules: '◷',
  metrics: '▥',
  settings: '⚙',
  switchUser: '⇄',
  resetDemo: '↺',
  logout: '↪',
  desk: '▭',
  open: '▾',
  closed: '▴',
};

const itemClassName =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-theme-control px-2.5 py-2 text-left text-[14.5px] text-text-secondary outline-none hover:bg-surface-hover data-[active-item]:bg-surface-hover';

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

function AccountSettings({ collapsed = false }: { collapsed?: boolean }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthContext();
  const { showToast } = useToastContext();
  const queryClient = useQueryClient();
  const { data: startupConfig } = useGetStartupConfig();
  const menu = Menu.useMenuStore({ placement: collapsed ? 'right-end' : 'top-start' });
  const isOpen = menu.useState('open');
  const hasScheduleAccess = useHasAccess({
    permissionType: PermissionTypes.SCHEDULES,
    permission: Permissions.USE,
  });
  const schedulesEnabled =
    isSchedulesEnabled(startupConfig?.interface?.schedules) && hasScheduleAccess;
  const { data: schedulesData } = useSchedulesQuery({
    enabled: !!isAuthenticated && isOpen && schedulesEnabled,
  });
  const { data: switchUserData, isSuccess: isSwitchUserQuerySuccess } = useDemoSwitchUserQuery({
    enabled: !!isAuthenticated && isOpen,
  });
  const switchUserMutation = useDemoSwitchUserMutation({
    onSuccess: () => window.location.assign('/'),
    onError: () =>
      showToast({
        message: localize('com_ui_demo_switch_error'),
        status: 'error',
      }),
  });
  const resetDemoMutation = useDemoResetMutation({
    onSuccess: () => {
      showToast({
        message: localize('com_ui_demo_reset_success'),
        status: 'success',
      });
      void queryClient.invalidateQueries();
      navigate('/', { replace: true });
    },
    onError: () =>
      showToast({
        message: localize('com_ui_demo_reset_error'),
        status: 'error',
      }),
  });
  const { data: usedBytes } = useGetFiles<number>({
    enabled: !!isAuthenticated && isOpen,
    select: (files: TFile[]) => files.reduce((sum, file) => sum + (file.bytes ?? 0), 0),
  });
  const [showFiles, setShowFiles] = useState(false);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const accountSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const displayName = user?.name || user?.username || localize('com_nav_user');
  const hasAvatarImage = user?.avatar != null && user.avatar !== '';
  const switchTarget = switchUserData?.target;
  const canSwitchDemoUser = typeof switchTarget?.name === 'string' && switchTarget.name.length > 0;
  const canResetDemo = user?.role === SystemRoles.ADMIN && isSwitchUserQuerySuccess;

  const openDeskDownload = () => window.open(DESK_DOWNLOAD_PATH, '_blank', 'noopener,noreferrer');

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
        <Menu.MenuItem onClick={() => setShowFiles(true)} className={itemClassName}>
          <MenuGlyph glyph={GLYPHS.files} />
          <span className="flex-1">{localize('com_nav_my_files')}</span>
          <span className="text-xs text-text-muted">{formatUsedSize(usedBytes ?? 0)}</span>
        </Menu.MenuItem>
        {schedulesEnabled && (
          <Menu.MenuItem onClick={() => navigate('/schedules')} className={itemClassName}>
            <MenuGlyph glyph={GLYPHS.schedules} />
            <span className="flex-1">{localize('com_ui_schedules_title')}</span>
            <span className="text-xs text-text-muted">{schedulesData?.schedules.length ?? 0}</span>
          </Menu.MenuItem>
        )}
        {user?.role === SystemRoles.ADMIN && (
          <Menu.MenuItem onClick={() => navigate('/operations')} className={itemClassName}>
            <MenuGlyph glyph={GLYPHS.metrics} />
            <span className="flex-1">{localize('com_metrics_title')}</span>
            <span className="text-xs text-text-muted">{localize('com_ui_admin')}</span>
          </Menu.MenuItem>
        )}
        <Menu.MenuItem onClick={() => navigate('/settings')} className={itemClassName}>
          <MenuGlyph glyph={GLYPHS.settings} />
          <span className="flex-1">{localize('com_nav_settings')}</span>
          <span className="text-xs text-text-muted">{localize('com_ui_settings_hint')}</span>
        </Menu.MenuItem>
        {canSwitchDemoUser && (
          <Menu.MenuItem
            onClick={() => switchUserMutation.mutate()}
            disabled={switchUserMutation.isLoading}
            className={itemClassName}
          >
            <MenuGlyph glyph={GLYPHS.switchUser} />
            <span className="flex-1">{localize('com_ui_demo_switch_user')}</span>
            <span className="text-xs text-text-muted">{switchTarget.name}</span>
          </Menu.MenuItem>
        )}
        <DropdownMenuSeparator />
        {canResetDemo && (
          <Menu.MenuItem
            onClick={() => setShowResetConfirmation(true)}
            disabled={resetDemoMutation.isLoading}
            className={itemClassName}
          >
            <MenuGlyph glyph={GLYPHS.resetDemo} />
            {localize('com_ui_demo_reset')}
          </Menu.MenuItem>
        )}
        <Menu.MenuItem onClick={() => logout()} className={itemClassName}>
          <MenuGlyph glyph={GLYPHS.logout} />
          {localize('com_nav_log_out')}
        </Menu.MenuItem>
        <Menu.MenuItem onClick={openDeskDownload} className={itemClassName}>
          <MenuGlyph glyph={GLYPHS.desk} />
          {localize('com_nav_desk_app')}
        </Menu.MenuItem>
      </Menu.Menu>
      <OGDialog open={showResetConfirmation} onOpenChange={setShowResetConfirmation}>
        <OGDialogTemplate
          title={localize('com_ui_demo_reset_title')}
          description={localize('com_ui_demo_reset_confirmation')}
          selection={{
            selectHandler: () => resetDemoMutation.mutate(),
            selectClasses:
              'bg-surface-destructive hover:bg-surface-destructive-hover text-text-on-status transition-colors duration-200',
            selectText: localize('com_ui_demo_reset_action'),
            isLoading: resetDemoMutation.isLoading,
          }}
        />
      </OGDialog>
      {showFiles && (
        <MyFilesModal
          open={showFiles}
          onOpenChange={setShowFiles}
          triggerRef={accountSettingsButtonRef}
        />
      )}
    </Menu.MenuProvider>
  );
}

export default memo(AccountSettings);
