import React from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/** 만들기 편집기의 아이콘 선택지와 같은 10개. */
const SKILL_ICON_CHOICES = ['🤖', '📈', '🌍', '📅', '✈️', '🗓️', '📋', '📊', '🎤', '🧾'];

const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

/** 마켓 목록과 상세 창에 보일 이모지 아이콘을 고른다. 폼 값 이름은 `icon`이다. */
export default function IconSelector() {
  const localize = useLocalize();
  const { control } = useFormContext();
  return (
    <Controller
      name="icon"
      control={control}
      render={({ field }) => (
        <div
          role="radiogroup"
          aria-label={localize('com_skills_icon')}
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="mr-1 text-sm text-text-secondary">{localize('com_skills_icon')}</span>
          {SKILL_ICON_CHOICES.map((icon) => (
            <button
              key={icon}
              type="button"
              role="radio"
              aria-checked={field.value === icon}
              onClick={() => field.onChange(field.value === icon ? '' : icon)}
              className={cn(
                'inline-flex size-9 items-center justify-center rounded-full border-[1.5px] border-border-light bg-surface-primary text-[19px]',
                field.value === icon && 'border-[#8b5cf6] shadow-[0_0_0_3px_#ede9fe]',
              )}
              style={{ fontFamily: EMOJI_FONT }}
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    />
  );
}
