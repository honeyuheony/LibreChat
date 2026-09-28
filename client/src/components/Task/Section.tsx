import { Button } from '@librechat/client';
import type { ReactNode } from 'react';
import { cn } from '~/utils';

export function Section({
  title,
  count,
  action,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: ReactNode;
  /** 제목 오른쪽 링크. 펼침 단추 안이 아니라 옆에 둔다. */
  action?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border-light px-[18px] pb-4 pt-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-bold text-text-primary"
        >
          <span aria-hidden="true" className="w-3 text-[11px] text-text-muted">
            {open ? '▾' : '▸'}
          </span>
          {title}
          {count != null && (
            <span className="font-medium tracking-normal text-text-muted">{count}</span>
          )}
        </button>
        {action}
      </div>
      {open && children}
    </section>
  );
}

export function HeadingLink({
  onClick,
  expanded,
  children,
}: {
  onClick: () => void;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="pill"
      onClick={onClick}
      aria-expanded={expanded}
      className="h-auto px-0 text-[12.5px] font-medium text-link hover:bg-transparent hover:text-link-hover"
    >
      {children}
    </Button>
  );
}

export function ContextRow({
  icon,
  text,
  status,
  muted,
}: {
  icon: string;
  text: ReactNode;
  status?: ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13.5px]',
        muted ? 'text-text-muted' : 'text-text-secondary',
      )}
    >
      <span aria-hidden="true" className="w-[18px] text-center text-[13px] text-text-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {status != null && <span className="text-xs text-text-muted">{status}</span>}
    </div>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 ml-2 mt-2.5 text-[11.5px] font-semibold tracking-[.04em] text-text-muted first:mt-0">
      {children}
    </div>
  );
}
