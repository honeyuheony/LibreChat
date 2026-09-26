import { TriangleAlert } from 'lucide-react';
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
