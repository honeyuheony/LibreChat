import { useMemo, useState } from 'react';
import { Button } from '@librechat/client';
import type { Agents } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { TaskApprovalStatus, TaskChip } from './TaskChip';
import useTaskApproval from './useTaskApproval';
import { stringList } from './stages';
import { useLocalize } from '~/hooks';

/**
 * Views offered when the model called the tool without any (agent-less summary).
 * The Korean value is what the server gets as `view` whatever the screen language,
 * so the summary prompt and the saved args stay the same; only the chip is translated.
 */
const DEFAULT_VIEWS: { value: string; label: TranslationKeys }[] = [
  { value: '간부 보고용', label: 'com_ui_task_view_default_brief' },
  { value: '위험 요인 중심', label: 'com_ui_task_view_default_risk' },
  { value: '정책 시사점 중심', label: 'com_ui_task_view_default_policy' },
];

const DEFAULT_VIEW_VALUES = DEFAULT_VIEWS.map((view) => view.value);

/** What to show for a `view` value: a default's translated name, anything else as is. */
export function viewLabel(view: string, localize: ReturnType<typeof useLocalize>): string {
  const preset = DEFAULT_VIEWS.find((item) => item.value === view);
  return preset != null ? localize(preset.label) : view;
}

/**
 * The picker after the call ran, read-only, with the perspective it ran with on.
 * `args` come from the saved tool call, rewritten on completion with the arguments
 * the tool actually got, so `view` is the user's pick rather than the model's.
 */
export function TaskViewRan({ args }: { args: Record<string, unknown> }) {
  const localize = useLocalize();
  const picked = typeof args.view === 'string' ? args.view : null;
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
        <p className="mt-2.5 text-sm text-text-secondary">{localize('com_ui_task_ran')}</p>
      </div>
    </div>
  );
}

/**
 * Perspective picker for a paused `summarize_documents` call. Nothing is picked up
 * front, even when the model passed `view`, so the user always chooses before running.
 */
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
  const { status, locked, submit } = useTaskApproval(approval.actionId, toolCallId);
  const offered = useMemo(() => {
    const views = stringList(args.views);
    return views.length > 0 ? views : DEFAULT_VIEW_VALUES;
  }, [args.views]);
  const [custom, setCustom] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftView, setDraftView] = useState('');
  const views = [...offered, ...custom.filter((view) => !offered.includes(view))];

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
          {!locked && !adding && (
            <TaskChip
              label={localize('com_ui_task_view_custom')}
              dashed
              onClick={() => setAdding(true)}
            />
          )}
          {adding && (
            <input
              // The field only appears after the user presses the add chip, so focus follows that press.
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
          {status === 'submitted' ? (
            <span className="text-sm text-text-secondary">{localize('com_ui_task_ran')}</span>
          ) : (
            <>
              <Button
                size="sm"
                variant="submit"
                disabled={locked || picked == null}
                onClick={() => picked != null && submit({ ...args, views, view: picked })}
              >
                {localize('com_ui_task_run')}
              </Button>
              <TaskApprovalStatus status={status} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
