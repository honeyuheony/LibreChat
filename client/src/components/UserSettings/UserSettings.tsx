import { useEffect, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import { Link } from 'react-router-dom';
import { Button, Spinner, useMediaQuery, useToastContext } from '@librechat/client';
import {
  DEFAULT_USER_APPROVAL_MODE,
  MAX_USER_INSTRUCTIONS_LENGTH,
  SettingsTabValues,
  USER_APPROVAL_MODES,
} from 'librechat-data-provider';
import type { UserApprovalMode } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import {
  useUpdateWorkspacePreferencesMutation,
  useWorkspacePreferencesQuery,
} from '~/data-provider/User';
import { settingsDialogTabAtom } from '~/components/Nav/Settings/state';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { pageTopBarClassName } from '~/components/ui/topbar';
import { useLocalize } from '~/hooks';

export default function UserSettings() {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { showToast } = useToastContext();
  const setSettingsDialogTab = useSetAtom(settingsDialogTabAtom);
  const { data: preferences, isError, isLoading, refetch } = useWorkspacePreferencesQuery();
  const [instructions, setInstructions] = useState('');
  const [approvalMode, setApprovalMode] = useState<UserApprovalMode>(DEFAULT_USER_APPROVAL_MODE);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const savedInstructions = useRef<string | null>(null);
  const savedApprovalMode = useRef<UserApprovalMode | null>(null);

  useEffect(() => {
    if (!preferences || preferencesLoaded) {
      return;
    }
    savedInstructions.current = preferences.instructions;
    savedApprovalMode.current = preferences.approvalMode;
    setInstructions(preferences.instructions);
    setApprovalMode(preferences.approvalMode);
    setPreferencesLoaded(true);
  }, [preferences, preferencesLoaded]);

  const instructionsMutation = useUpdateWorkspacePreferencesMutation({
    onSuccess: (_response, payload) => {
      if (payload.instructions === undefined) {
        return;
      }
      savedInstructions.current = payload.instructions;
      showToast({
        message: localize('com_ui_user_settings_instructions_saved'),
        status: 'success',
      });
    },
    onError: () =>
      showToast({
        message: localize('com_ui_user_settings_save_error'),
        status: 'error',
      }),
  });

  const approvalModeMutation = useUpdateWorkspacePreferencesMutation({
    onSuccess: (_response, payload) => {
      if (payload.approvalMode !== undefined) {
        savedApprovalMode.current = payload.approvalMode;
      }
    },
    onError: () => {
      if (savedApprovalMode.current !== null) {
        setApprovalMode(savedApprovalMode.current);
      }
      showToast({
        message: localize('com_ui_user_settings_save_error'),
        status: 'error',
      });
    },
  });

  let settingsContent: ReactNode;
  if (isError && !preferences) {
    settingsContent = (
      <div className="flex flex-col items-start gap-3" role="alert">
        <p className="text-sm text-text-secondary">{localize('com_ui_user_settings_load_error')}</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          {localize('com_ui_retry')}
        </Button>
      </div>
    );
  } else if (isLoading || !preferences || !preferencesLoaded) {
    settingsContent = (
      <div
        role="status"
        aria-busy="true"
        aria-label={localize('com_ui_loading')}
        className="flex items-center gap-2 py-6 text-sm text-text-secondary"
      >
        <Spinner className="size-4" />
        {localize('com_ui_loading')}
      </div>
    );
  } else {
    settingsContent = (
      <div className="space-y-3">
        <p
          role="note"
          className="rounded-lg border border-accent-primary/20 bg-surface-brand-subtle px-2.5 py-2 text-[13px] text-accent-primary"
        >
          {localize('com_ui_user_settings_connection_prefix')}
          <Link to="/connectors" className="text-link hover:underline">
            {localize('com_ui_user_settings_data_integrations')}
          </Link>
          {localize('com_ui_user_settings_connection_suffix')}
        </p>
        <section className="space-y-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="global-instructions"
              className="text-[13px] font-normal text-text-muted"
            >
              {localize('com_ui_user_settings_global_instructions')}
            </label>
            <textarea
              id="global-instructions"
              rows={4}
              maxLength={MAX_USER_INSTRUCTIONS_LENGTH}
              value={instructions}
              onChange={(event) => setInstructions(event.currentTarget.value)}
              onBlur={() => {
                if (instructions !== savedInstructions.current) {
                  instructionsMutation.mutate({ instructions });
                }
              }}
              aria-describedby="global-instructions-hint"
              className="w-full max-w-[520px] resize-y rounded-md border border-border-light bg-surface-primary px-3 py-2 text-[13px] text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-medium"
            />
            <p id="global-instructions-hint" className="text-[13px] text-text-muted">
              {localize('com_ui_user_settings_global_instructions_hint')}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="approval-mode" className="text-[13px] font-normal text-text-muted">
              {localize('com_ui_user_settings_approval_mode')}
            </label>
            <select
              id="approval-mode"
              value={approvalMode}
              onChange={(event) => {
                const nextApprovalMode = USER_APPROVAL_MODES.find(
                  (mode) => mode === event.currentTarget.value,
                );
                if (!nextApprovalMode) {
                  return;
                }
                setApprovalMode(nextApprovalMode);
                if (nextApprovalMode !== savedApprovalMode.current) {
                  approvalModeMutation.mutate({ approvalMode: nextApprovalMode });
                }
              }}
              className="h-[39px] w-full max-w-[520px] rounded-lg border border-border-medium bg-surface-tertiary px-2.5 py-[7px] text-[14.5px] text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-medium"
            >
              <option value="manual">{localize('com_ui_user_settings_approval_manual')}</option>
              <option value="auto">{localize('com_ui_user_settings_approval_auto')}</option>
            </select>
          </div>
        </section>
      </div>
    );
  }

  return (
    <main
      className="relative flex h-full w-full grow flex-col overflow-y-auto bg-presentation"
      data-testid="user-settings"
    >
      <header className={pageTopBarClassName}>
        {isSmallScreen && <OpenSidebar />}
        <span className="font-semibold text-text-primary">{localize('com_nav_settings')}</span>
      </header>
      <div className="px-4 pb-10 pt-6 md:pt-4">
        <div className="mx-auto w-full max-w-[710px]">
          <h1 className="mb-2.5 text-[22px] font-bold text-text-primary">
            {localize('com_nav_settings')}
          </h1>
          {settingsContent}
          <Button
            type="button"
            variant="ghost"
            className="mt-6 h-auto w-full justify-start rounded-none border-t border-border-light px-0 py-3 text-sm font-normal text-text-secondary"
            onClick={() => setSettingsDialogTab(SettingsTabValues.GENERAL)}
          >
            {localize('com_ui_account_settings_more')}
          </Button>
        </div>
      </div>
    </main>
  );
}
