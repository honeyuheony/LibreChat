import { useMemo, useState } from 'react';
import type { Agents } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { TaskApprovalActions, TaskChip } from './TaskChip';
import useTaskApproval from './useTaskApproval';
import { stringList } from './stages';
import { useLocalize } from '~/hooks';

/** 서버에는 고정된 `view` 값을 보내고, 칩에는 현재 언어의 번역을 표시한다. */
const DEFAULT_VIEWS: { value: string; label: TranslationKeys }[] = [
  { value: '간부 보고용', label: 'com_ui_task_view_default_brief' },
  { value: '위험 요인 중심', label: 'com_ui_task_view_default_risk' },
  { value: '정책 시사점 중심', label: 'com_ui_task_view_default_policy' },
];

const DEFAULT_VIEW_VALUES = DEFAULT_VIEWS.map((view) => view.value);

export function viewLabel(view: string, localize: ReturnType<typeof useLocalize>): string {
  const preset = DEFAULT_VIEWS.find((item) => item.value === view);
  return preset != null ? localize(preset.label) : view;
}

/** 완료된 tool call에는 승인 후 선택한 `view`가 저장되어 그대로 보여 준다. */
export function TaskViewRan({
  args,
  cancelled = false,
}: {
  args: Record<string, unknown>;
  /** 이 카드에서 취소했으므로 선택한 관점은 실행하지 않았다. */
  cancelled?: boolean;
}) {
  const localize = useLocalize();
  const picked = !cancelled && typeof args.view === 'string' ? args.view : null;
  const offered = stringList(args.views);
  const views = offered.length > 0 ? offered : [...DEFAULT_VIEW_VALUES];
  if (picked != null && !views.includes(picked)) {
    views.push(picked);
  }
  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="task-view-ran">
      <p className="text-[0.9375rem] text-text-primary">{localize('com_ui_task_view_intro')}</p>
      <div className="rounded-xl border border-border-light bg-surface-primary px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {views.map((view) => (
            <TaskChip key={view} label={viewLabel(view, localize)} on={view === picked} disabled />
          ))}
        </div>
        <p className="mt-2.5 text-sm text-text-secondary">
          {localize(cancelled ? 'com_ui_task_cancelled' : 'com_ui_task_ran')}
        </p>
      </div>
    </div>
  );
}

/** 모델이 `view`를 보냈어도 사용자가 실행 전에 관점을 고르도록 선택을 비워 둔다. */
export default function TaskViewApproval({
  approval,
  toolCallId,
  args,
}: {
  approval: NonNullable<Agents.ToolCall['approval']>;
  toolCallId: string;
  args: Record<string, unknown>;
}) {
  const localize = useLocalize();
  const {
    status,
    locked,
    decision,
    othersPending,
    canEdit,
    canReject,
    resolveRun,
    decide,
    reject,
  } = useTaskApproval(approval, toolCallId);
  const offered = useMemo(() => {
    const views = stringList(args.views);
    return views.length > 0 ? views : DEFAULT_VIEW_VALUES;
  }, [args.views]);
  const [custom, setCustom] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftView, setDraftView] = useState('');
  const views = [...offered, ...custom.filter((view) => !offered.includes(view))];
  /** 모델이 제안한 `view`를 그대로 골랐으면 변경 없이 승인으로 보낸다. */
  const changed = !(custom.length === 0 && typeof args.view === 'string' && picked === args.view);
  const resolution = picked == null ? null : resolveRun({ ...args, views, view: picked }, changed);

  const addView = () => {
    const view = draftView.trim();
    if (view.length > 0) {
      setCustom((current) => (current.includes(view) ? current : [...current, view]));
      setPicked(view);
    }
    setDraftView('');
    setAdding(false);
  };

  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="task-view-approval">
      <p className="text-[0.9375rem] text-text-primary">{localize('com_ui_task_view_intro')}</p>
      <div className="rounded-xl border border-border-light bg-surface-primary px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {views.map((view) => (
            <TaskChip
              key={view}
              label={viewLabel(view, localize)}
              on={picked === view}
              disabled={locked}
              onClick={() => setPicked(view)}
            />
          ))}
          {!locked && canEdit && !adding && (
            <TaskChip
              label={localize('com_ui_task_view_custom')}
              dashed
              onClick={() => setAdding(true)}
            />
          )}
          {adding && (
            <input
              // 추가 칩을 눌러 입력 칸이 생기면 바로 입력하도록 초점을 옮긴다.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={draftView}
              onChange={(event) => setDraftView(event.target.value)}
              onBlur={addView}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  addView();
                } else if (event.key === 'Escape') {
                  setDraftView('');
                  setAdding(false);
                }
              }}
              placeholder={localize('com_ui_task_view_custom_placeholder')}
              aria-label={localize('com_ui_task_view_custom_placeholder')}
              className="w-48 rounded-lg border border-border-xheavy bg-surface-primary px-2.5 py-1 text-sm text-text-primary placeholder:text-text-secondary"
            />
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <TaskApprovalActions
            status={status}
            locked={locked}
            decision={decision}
            othersPending={othersPending}
            runDisabled={resolution == null}
            onRun={() => resolution != null && decide(resolution)}
            onReject={canReject ? reject : undefined}
            blockedReason={
              picked != null && resolution == null
                ? localize('com_ui_task_edit_not_allowed')
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
