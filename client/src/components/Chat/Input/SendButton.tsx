import React, { forwardRef } from 'react';
import { useWatch } from 'react-hook-form';
import { composerSubmitClasses, SendIcon, TooltipAnchor } from '@librechat/client';
import type { Control } from 'react-hook-form';
import { cn, isSubmittableMessage } from '~/utils';
import { useLocalize } from '~/hooks';

type SendButtonProps = {
  disabled: boolean;
  control: Control<{ text: string }>;
  /** Number of attached files; attachments allow sending without text */
  fileCount?: number;
};

type SubmitButtonProps = { disabled: boolean; empty: boolean };

/** 빈 입력은 `disabled` 대신 `aria-disabled`로 막아 그라데이션을 유지하고, 전송 중처럼 정말 쓸 수 없을 때만 흐리게 한다. */
const SubmitButton = React.memo(
  forwardRef((props: SubmitButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const localize = useLocalize();
    return (
      <TooltipAnchor
        description={localize('com_nav_send_message')}
        render={
          <button
            ref={ref}
            aria-label={localize('com_nav_send_message')}
            id="send-button"
            disabled={props.disabled}
            aria-disabled={props.empty || undefined}
            onClick={props.empty ? (e) => e.preventDefault() : undefined}
            className={cn(composerSubmitClasses(), props.empty && 'cursor-not-allowed')}
            data-testid="send-button"
            type="submit"
          >
            <span className="" data-state="closed">
              <SendIcon size={24} />
            </span>
          </button>
        }
      />
    );
  }),
);

const SendButton = React.memo(
  forwardRef((props: SendButtonProps, ref: React.ForwardedRef<HTMLButtonElement>) => {
    const data = useWatch({ control: props.control });
    const canSubmit = isSubmittableMessage(data?.text, props.fileCount);
    return (
      <SubmitButton ref={ref} disabled={props.disabled} empty={!props.disabled && !canSubmit} />
    );
  }),
);

export default SendButton;
