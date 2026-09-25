import { lazy, Suspense, useCallback } from 'react';
import { useAtom } from 'jotai';
import { settingsDialogTabAtom } from './state';

/** Lazy so the settings registry stays out of the sidebar chunk until the dialog first opens. */
const SettingsDialog = lazy(() => import('./Dialog'));

/** Renders the settings dialog for whichever control opened it (account menu, sidebar row). */
export default function SettingsHost() {
  const [tab, setTab] = useAtom(settingsDialogTabAtom);
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setTab(null);
      }
    },
    [setTab],
  );

  if (tab == null) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <SettingsDialog open initialTab={tab} onOpenChange={handleOpenChange} />
    </Suspense>
  );
}
