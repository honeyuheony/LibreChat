import { lazy, Suspense, useCallback } from 'react';
import { useAtom } from 'jotai';
import { settingsDialogTabAtom } from './state';

/** 설정 대화상자를 처음 열 때만 registry를 불러 sidebar bundle을 줄인다. */
const SettingsDialog = lazy(() => import('./Dialog'));

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
