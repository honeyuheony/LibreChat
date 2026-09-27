import { useState } from 'react';
import type { TaskProgressEvent } from 'librechat-data-provider';
import type { TaskActivity, TaskStepView, TaskToolCallState } from './taskState';
import { HeadingLink, Section } from './Section';
import { formatTaskTime } from './taskState';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

function ActivityLog({
  label,
  activity,
  titles,
}: {
  label: string;
  activity: TaskActivity[];
  titles: Map<string, string>;
}) {
  return (
    <ol
      aria-label={label}
      className="mt-2 flex max-h-[180px] flex-col gap-1 overflow-auto border-t border-dashed border-border-light pt-2 text-[12.5px] text-text-secondary"
    >
      {activity.map((entry) => (
        <li key={entry.id} className="flex items-start gap-2 leading-normal">
          <span className="w-[42px] shrink-0 pt-0.5 font-mono text-[11.5px] text-text-muted">
            {formatTaskTime(entry.createdAt)}
          </span>
          <span className="min-w-0 break-words">
            {entry.serverName != null
              ? `${entry.name} · ${titles.get(entry.serverName) ?? entry.serverName}`
              : entry.name}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function ProgressSection({
  call,
  awaiting,
  steps,
  progress,
  activity,
  serverTitles,
  open,
  onToggle,
}: {
  call: TaskToolCallState;
  /** 호출 자체의 값이 아니라 `isAwaitingTaskApproval` 의 결과다. */
  awaiting: boolean;
  steps: TaskStepView[];
  progress: TaskProgressEvent | null;
  activity: TaskActivity[];
  serverTitles: Map<string, string>;
  open: boolean;
  onToggle: () => void;
}) {
  const localize = useLocalize();
  const [logOpen, setLogOpen] = useState(false);
  const activityLabel = localize('com_ui_task_activity', { count: activity.length });
  const doneSteps = steps.filter((step) => step.state === 'done').length;
  const liveProgress = !call.finished && !awaiting ? progress : null;
  const percent =
    liveProgress != null
      ? Math.round((100 * liveProgress.done) / Math.max(1, liveProgress.total))
      : Math.round((100 * doneSteps) / Math.max(1, steps.length));

  return (
    <Section
      title={localize('com_ui_task_progress')}
      count={`${doneSteps}/${steps.length}`}
      action={
        activity.length > 0 && (
          <HeadingLink expanded={logOpen} onClick={() => setLogOpen((value) => !value)}>
            {logOpen ? localize('com_ui_task_activity_close') : activityLabel}
          </HeadingLink>
        )
      }
      open={open}
      onToggle={onToggle}
    >
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mb-2.5 mt-0.5 h-1.5 overflow-hidden rounded-[3px] bg-border-light"
      >
        <i
          className="block h-full bg-accent-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ol>
        {steps.map((step, index) => (
          <li
            key={step.id}
            data-state={step.state}
            className={cn(
              'flex items-start gap-2.5 rounded-md px-2 py-[7px] text-[13.5px] leading-[1.45]',
              step.state === 'now'
                ? 'bg-surface-brand-subtle font-semibold text-text-primary'
                : 'text-text-muted',
            )}
          >
            <span
              className={cn(
                'mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] font-mono text-[11px]',
                step.state === 'done' && 'border-status-success bg-status-success text-white',
                step.state === 'now' && 'border-accent-primary bg-accent-primary text-white',
                step.state === 'todo' && 'border-border-medium text-text-muted',
                step.state === 'stopped' && 'border-border-heavy text-text-secondary',
              )}
            >
              {step.state === 'done' && '✓'}
              {step.state === 'stopped' && '✕'}
              {(step.state === 'now' || step.state === 'todo') && index + 1}
            </span>
            <span>
              {localize(step.label)}
              {step.state === 'now' && liveProgress?.stage === step.id && (
                <span className="mt-0.5 block text-xs font-normal text-text-muted">
                  {liveProgress.label} · {liveProgress.done}/{liveProgress.total}
                </span>
              )}
              {step.state === 'now' && awaiting && (
                <span className="mt-0.5 block text-xs font-normal text-text-muted">
                  {localize('com_ui_task_waiting_approval')}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {logOpen && <ActivityLog label={activityLabel} activity={activity} titles={serverTitles} />}
    </Section>
  );
}
