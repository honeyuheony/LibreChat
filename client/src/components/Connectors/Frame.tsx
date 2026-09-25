import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from '~/utils';

interface ConnectorFrameProps {
  icon: ReactNode;
  name: string;
  pill: ReactNode;
  summary: ReactNode;
  action?: ReactNode;
  emphasized?: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** Connector card shell; a `div` list item because `mobile.css` restyles every `li a` link. */
export default function ConnectorFrame({
  icon,
  name,
  pill,
  summary,
  action,
  emphasized = false,
  expanded,
  onToggle,
  children,
}: ConnectorFrameProps) {
  const detailsId = useId();
  return (
    <div
      role="listitem"
      className={cn(
        'overflow-hidden rounded-theme-surface border bg-surface-primary',
        emphasized ? 'border-border-brand' : 'border-border-light',
      )}
    >
      <div className="flex items-center gap-3.5 p-4">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? detailsId : undefined}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3.5 rounded-theme-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
        >
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-theme-control text-sm font-bold',
              emphasized
                ? 'bg-surface-brand-subtle text-accent-primary'
                : 'bg-surface-tertiary text-text-secondary',
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-base font-semibold text-text-primary">{name}</span>
              {pill}
            </span>
            <span className="truncate text-sm text-text-secondary">{summary}</span>
          </span>
        </button>
        {action}
      </div>
      {expanded && (
        <div
          id={detailsId}
          className="border-t border-border-light bg-surface-secondary py-3 pl-[4.375rem] pr-4"
        >
          {children}
        </div>
      )}
    </div>
  );
}
