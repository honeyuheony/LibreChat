import { Check, X, Loader2 } from 'lucide-react';
import type { ToolCallPhase } from '~/utils/toolCallPhase';

/** Status glyph of one step inside a tool group: done, running or failed. */
export default function StepIcon({ phase }: { phase: ToolCallPhase }) {
  if (phase === 'running') {
    return (
      <Loader2
        className="size-4 animate-spin text-text-secondary motion-reduce:animate-none"
        aria-hidden="true"
        data-testid="step-icon-running"
      />
    );
  }
  if (phase === 'failed') {
    return (
      <span
        className="flex size-5 items-center justify-center rounded-full bg-status-error-subtle text-status-error"
        data-testid="step-icon-failed"
      >
        <X className="size-3" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className="flex size-5 items-center justify-center rounded-full bg-status-success-subtle text-status-success"
      data-testid="step-icon-completed"
    >
      <Check className="size-3" strokeWidth={3} aria-hidden="true" />
    </span>
  );
}
