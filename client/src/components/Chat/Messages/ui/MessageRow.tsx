import type { TConversation, TMessage } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import MessageTimestamp from './MessageTimestamp';
import HeaderLabel from './HeaderLabel';
import { cn } from '~/utils';

type MessageRowProps = {
  id?: string;
  label: string;
  hoverLabel?: string | null;
  icon: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  timestamp?: string | null;
  ariaLabel?: string;
  headerPrefix?: string;
  isCreatedByUser: boolean;
  hasParallelContent?: boolean;
  fullWidth?: boolean;
  isEditing?: boolean;
  /** Full-width block without the author header or user bubble — for rows
   *  whose body carries its own header (e.g. wake-up task cards). */
  plain?: boolean;
  /** Shows the assistant's name in small type above the reply; hidden (screen-reader only) otherwise. */
  showAuthor?: boolean;
  className?: string;
};

/** A reply names its author only when someone other than the conversation's current
 *  agent (or model) wrote it; a single-agent conversation shows no names. */
export function shouldShowAuthor(
  message: Pick<TMessage, 'isCreatedByUser' | 'model'> | undefined,
  conversation: Pick<TConversation, 'agent_id' | 'model'> | null | undefined,
): boolean {
  if (message == null || message.isCreatedByUser === true || !message.model) {
    return false;
  }
  const current = conversation?.agent_id ?? conversation?.model;
  return current != null && current !== '' && message.model !== current;
}

export function getMessageRowWidthClass({
  fullWidth = false,
  hasParallelContent = false,
}: {
  fullWidth?: boolean;
  hasParallelContent?: boolean;
} = {}) {
  if (fullWidth) return 'w-full max-w-full sm:px-2';
  if (hasParallelContent) return 'w-full sm:px-2 md:max-w-[58rem] xl:max-w-[70rem]';
  /** 48.5rem minus the `sm:px-2` gutters leaves the 760px reading column of the design. */
  return 'w-full sm:px-2 md:max-w-[48.5rem]';
}

export default function MessageRow({
  id,
  icon,
  label,
  hoverLabel,
  footer,
  children,
  timestamp,
  ariaLabel,
  className,
  headerPrefix,
  isCreatedByUser,
  hasParallelContent = false,
  fullWidth = false,
  isEditing = false,
  plain = false,
  showAuthor = false,
}: MessageRowProps) {
  // `sm:px-2` mirrors ChatForm, so the body lines up with the composer surface
  // rather than the form's outer box once both use the same max-width.
  const widthClass = getMessageRowWidthClass({ fullWidth, hasParallelContent });

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'message-render group mx-auto flex min-w-0 flex-1 font-theme-ui transition-[max-width] duration-theme-normal motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary',
        isCreatedByUser && !plain ? 'justify-end' : 'items-start',
        widthClass,
        className,
      )}
    >
      <div
        className={cn(
          'relative flex min-w-0 flex-col',
          isCreatedByUser ? 'user-turn' : 'agent-turn',
          (hasParallelContent || isEditing || plain) && 'w-full',
          !hasParallelContent &&
            !plain &&
            isCreatedByUser &&
            cn('ml-auto items-end', !isEditing && 'w-fit max-w-[90%] sm:max-w-[75%]'),
          !hasParallelContent && !isCreatedByUser && !isEditing && 'flex-1',
        )}
      >
        {!hasParallelContent &&
          !plain &&
          (isCreatedByUser || !showAuthor ? (
            <h2 className="sr-only">
              {headerPrefix}
              {label}
              <MessageTimestamp value={timestamp} />
            </h2>
          ) : (
            <h2 className="mb-1 flex w-full select-none items-center gap-1.5 text-xs font-medium text-text-tertiary">
              <span
                aria-hidden="true"
                className="flex size-4 flex-shrink-0 items-center justify-center overflow-hidden rounded-full [&_img]:size-4 [&_svg]:size-4"
              >
                {icon}
              </span>
              <span className="sr-only">{headerPrefix}</span>
              <HeaderLabel label={label} hoverLabel={hoverLabel} />
              <MessageTimestamp value={timestamp} className="sr-only" />
            </h2>
          ))}

        <div className={cn('flex w-full flex-col gap-1', isCreatedByUser && !plain && 'items-end')}>
          <div
            className={cn(
              'flex min-h-[20px] max-w-full flex-grow flex-col gap-0',
              isCreatedByUser && !isEditing && !plain
                ? 'w-fit rounded-theme-surface bg-surface-message-user px-4 py-3 text-base leading-[var(--line-height-body)]'
                : 'w-full',
            )}
            data-testid="message-body"
          >
            {children}
          </div>
          <div className={cn('w-full', isCreatedByUser && !plain && 'flex justify-end')}>
            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}
