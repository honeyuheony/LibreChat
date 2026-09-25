import type { PillTone } from './status';
import { cn } from '~/utils';

const toneClassName: Record<PillTone, string> = {
  success: 'bg-status-success-subtle text-status-success',
  neutral: 'bg-status-neutral-subtle text-status-neutral',
  error: 'bg-status-error-subtle text-status-error',
};

const dotClassName: Record<PillTone, string> = {
  success: 'bg-status-success',
  neutral: 'bg-status-neutral',
  error: 'bg-status-error',
};

export default function StatusPill({
  tone,
  label,
  withDot = false,
}: {
  tone: PillTone;
  label: string;
  withDot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        toneClassName[tone],
      )}
    >
      {withDot && (
        <span className={cn('size-1.5 rounded-full', dotClassName[tone])} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
