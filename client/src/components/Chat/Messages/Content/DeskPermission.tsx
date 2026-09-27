import { useEffect, useState } from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import type { DeskPermission, DeskPermissionDecision } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useDeskPermissionsQuery } from '~/data-provider/Connectors/queries';
import { useLocalize } from '~/hooks';

/** 로컬 요청에는 충분하고, 다른 PC에서 닿지 않는 주소는 그 전에 실패한다. */
const LOCAL_CHECK_TIMEOUT_MS = 2000;

type CardState = 'checking' | 'same-pc' | 'other-pc' | 'sending' | 'answered' | 'failed';

/** 127.0.0.1 주소는 요청한 PC의 브라우저에서만 연결할 수 있다. */
const localUrl = (permission: DeskPermission) =>
  `http://127.0.0.1:${permission.localPort}/permissions/${permission.requestId}`;

const DECISIONS: Array<{
  decision: DeskPermissionDecision;
  labelKey: TranslationKeys;
  primary: boolean;
}> = [
  { decision: 'deny', labelKey: 'com_ui_desk_permission_deny', primary: false },
  { decision: 'always', labelKey: 'com_ui_desk_permission_always', primary: false },
  { decision: 'once', labelKey: 'com_ui_desk_permission_once', primary: true },
];

function DeskPermissionCard({ permission }: { permission: DeskPermission }) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const [state, setState] = useState<CardState>('checking');

  useEffect(() => {
    let cancelled = false;
    const token = encodeURIComponent(permission.approveToken);
    fetch(`${localUrl(permission)}?token=${token}`, {
      method: 'GET',
      signal: AbortSignal.timeout(LOCAL_CHECK_TIMEOUT_MS),
    })
      .then((response) => !cancelled && setState(response.ok ? 'same-pc' : 'other-pc'))
      .catch(() => !cancelled && setState('other-pc'));
    return () => {
      cancelled = true;
    };
  }, [permission]);

  const answer = async (decision: DeskPermissionDecision) => {
    setState('sending');
    try {
      const response = await fetch(localUrl(permission), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: permission.approveToken, decision }),
      });
      setState(response.ok ? 'answered' : 'failed');
    } catch {
      setState('failed');
    }
    queryClient.invalidateQueries([QueryKeys.deskPermissions]);
  };

  return (
    <div className="ml-8 mt-1 flex flex-col gap-2 rounded-theme-control border border-border-light bg-surface-secondary p-3 text-sm">
      <span className="break-all font-mono text-text-primary">{permission.path}</span>
      {state === 'other-pc' && (
        <span className="text-text-secondary">{localize('com_ui_desk_permission_other_pc')}</span>
      )}
      {state === 'answered' && (
        <span className="text-text-secondary">{localize('com_ui_desk_permission_answered')}</span>
      )}
      {state === 'failed' && (
        <span role="alert" className="text-status-error">
          {localize('com_ui_desk_permission_failed')}
        </span>
      )}
      {(state === 'same-pc' || state === 'sending') && (
        <div className="flex flex-wrap justify-end gap-2">
          {DECISIONS.map(({ decision, labelKey, primary }) => (
            <button
              key={decision}
              type="button"
              disabled={state === 'sending'}
              onClick={() => answer(decision)}
              className={
                primary
                  ? 'rounded-theme-control bg-surface-submit px-3 py-1.5 text-white hover:bg-surface-submit-hover disabled:opacity-50'
                  : 'rounded-theme-control border border-border-medium px-3 py-1.5 text-text-primary hover:bg-surface-hover disabled:opacity-50'
              }
            >
              {localize(labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 권한 응답은 서버를 거치지 않고 요청한 PC의 앱으로 직접 보낸다. */
export default function DeskPermissionPrompt() {
  const localize = useLocalize();
  const { data: permissions = [] } = useDeskPermissionsQuery();
  if (permissions.length === 0) {
    return null;
  }
  return (
    <div className="mb-1.5 flex flex-col gap-1.5">
      <p className="ml-8 text-sm text-text-secondary">
        {localize('com_ui_desk_permission_waiting')}
      </p>
      {permissions.map((permission) => (
        <DeskPermissionCard key={permission.requestId} permission={permission} />
      ))}
    </div>
  );
}
