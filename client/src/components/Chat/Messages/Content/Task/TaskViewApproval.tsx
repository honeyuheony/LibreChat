import { useMemo, useState } from 'react';
import { Button } from '@librechat/client';
import type { Agents } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { TaskApprovalStatus, TaskChip } from './TaskChip';
import useTaskApproval from './useTaskApproval';
import { stringList } from './stages';
import { useLocalize } from '~/hooks';

/** Views offered when the model called the tool without any (agent-less summary). */
const DEFAULT_VIEW_KEYS: TranslationKeys[] = [
  'com_ui_task_view_default_brief',
  'com_ui_task_view_default_risk',
  'com_ui_task_view_default_policy',
];

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
    return views.length > 0 ? views : DEFAULT_VIEW_KEYS.map((key) => localize(key));
  }, [args.views, localize]);
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
              label={view}
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
