import type { TaskEvidence } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

/** A numbered marker whose hover or focus card shows the quoted source text and where it sits. */
export default function TaskFootnote({
  n,
  filename,
  evidence,
}: {
  n: number;
  filename?: string;
  evidence?: TaskEvidence;
}) {
  const localize = useLocalize();
  const location = [
    filename,
    evidence?.page != null ? localize('com_ui_task_page', { 0: evidence.page }) : null,
    evidence?.page == null && evidence?.paragraph != null
      ? localize('com_ui_task_paragraph', { 0: evidence.paragraph })
      : null,
  ]
    .filter(Boolean)
    .join(' › ');

  return (
    <span className="group/fn relative inline-block">
      <sup
        tabIndex={0}
        className="ml-0.5 cursor-pointer text-[11px] font-semibold text-accent-primary outline-none"
        aria-label={[evidence?.quote, location].filter(Boolean).join(' — ')}
      >
        {n}
      </sup>
      {(evidence?.quote || location) && (
        <span
          role="tooltip"
          className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-1 w-64 -translate-x-1/2 rounded-md border border-border-light bg-surface-primary p-2 text-left text-xs font-normal text-text-secondary shadow-md group-focus-within/fn:visible group-hover/fn:visible"
        >
          {evidence?.quote && <span className="block whitespace-pre-wrap">{evidence.quote}</span>}
          {location && <span className="mt-1 block text-text-muted">{location}</span>}
        </span>
      )}
    </span>
  );
}
