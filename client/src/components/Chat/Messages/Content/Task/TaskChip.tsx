import { Button } from '@librechat/client';
import { TriangleAlert } from 'lucide-react';
import type { Agents } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export function TaskChip({
  label,
  on = false,
  dashed = false,
  disabled = false,
  onClick,
}: {
  label: string;
  on?: boolean;
  dashed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={dashed ? undefined : on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex select-none items-center rounded-lg border px-2.5 py-1 text-sm transition-colors',
        on
          ? 'border-surface-submit bg-surface-submit text-text-on-status'
          : 'border-border-medium bg-surface-primary text-text-primary',
        dashed && 'border-dashed text-text-secondary',
        !disabled && !on && 'hover:bg-surface-hover',
        disabled && 'cursor-default',
      )}
    >
      {label}
    </button>
  );
}

export function TaskApprovalStatus({ status }: { status: string }) {
  const localize = useLocalize();
  if (status !== 'expired' && status !== 'error') {
    return null;
  }
  return (
    <span className="flex items-center text-xs text-text-warning" role="alert">
      <TriangleAlert className="mr-1.5 size-4" aria-hidden="true" />
      {localize(status === 'expired' ? 'com_ui_approval_expired' : 'com_ui_approval_error')}
    </span>
  );
}

/**
 * The row under a task approval card: 「실행」, 「취소」 when the policy allows a reject,
 * the card's own details (the estimate), and why run is blocked. Once the decision is
 * sent it collapses to 「실행됨」 or 「취소됨」.
 */
export function TaskApprovalActions({
  status,
  locked,
  decision,
  runDisabled,
  onRun,
  onReject,
  blockedReason,
  children,
}: {
  status: string;
  locked: boolean;
  decision?: Agents.ToolApprovalDecisionType;
  runDisabled: boolean;
  onRun: () => void;
  onReject?: () => void;
  blockedReason?: string;
  children?: ReactNode;
}) {
  const localize = useLocalize();
  if (status === 'submitted') {
    return (
      <span className="text-sm text-text-secondary">
        {localize(decision === 'reject' ? 'com_ui_task_cancelled' : 'com_ui_task_ran')}
      </span>
    );
  }
  return (
    <>
      <Button size="sm" variant="submit" disabled={locked || runDisabled} onClick={onRun}>
        {localize('com_ui_task_run')}
      </Button>
      {onReject != null && (
        <Button size="sm" variant="outline" disabled={locked} onClick={onReject}>
          {localize('com_ui_cancel')}
        </Button>
      )}
      {children}
      {blockedReason != null && (
        <span className="text-sm text-text-warning" role="status">
          {blockedReason}
        </span>
      )}
      <TaskApprovalStatus status={status} />
    </>
  );
}
