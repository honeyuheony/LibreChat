import { Radio } from '@librechat/client';
import type { TSkillPublishScope } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';
import { Block } from './Preview';
import { cn } from '~/utils';

/** 와이어프레임의 「직접 하면 보통」 선택지(분). */
const MINUTE_CHOICES: ReadonlyArray<[number, TranslationKeys]> = [
  [10, 'com_skills_builder_minutes_10'],
  [30, 'com_skills_builder_minutes_30'],
  [60, 'com_skills_builder_minutes_60'],
  [120, 'com_skills_builder_minutes_120'],
  [240, 'com_skills_builder_minutes_240'],
];

type ShareProps = {
  manualMinutes: number;
  scope: TSkillPublishScope;
  onMinutes: (minutes: number) => void;
  onScope: (scope: TSkillPublishScope) => void;
};

export default function Share({ manualMinutes, scope, onMinutes, onScope }: ShareProps) {
  const localize = useLocalize();
  return (
    <Block
      title={
        <>
          {localize('com_skills_builder_share')}
          {manualMinutes > 0 ? null : (
            <span className="ms-1 rounded-full bg-status-error-subtle px-2 text-[10.5px] text-status-error">
              {localize('com_skills_builder_minutes_required')}
            </span>
          )}
        </>
      }
    >
      <div
        role="group"
        aria-label={localize('com_skills_builder_todo_minutes')}
        className="mb-1.5 flex flex-wrap items-center gap-2 text-[13.5px]"
      >
        <span className="text-text-secondary">{localize('com_skills_builder_minutes_before')}</span>
        <div className="inline-flex flex-wrap gap-1.5">
          {MINUTE_CHOICES.map(([minutes, labelKey]) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={manualMinutes === minutes}
              onClick={() => onMinutes(minutes)}
              className={cn(
                'rounded-full border px-3 py-1 text-[13px]',
                manualMinutes === minutes
                  ? 'border-border-brand bg-surface-brand-subtle font-semibold text-text-primary'
                  : 'border-border-light bg-surface-primary text-text-secondary hover:border-border-medium',
              )}
            >
              {localize(labelKey)}
            </button>
          ))}
        </div>
        <span className="text-text-secondary">{localize('com_skills_builder_minutes_after')}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
        <span id="builder-scope-label" className="text-text-secondary">
          {localize('com_skills_builder_scope')}
        </span>
        {/* 선택한 단추가 색을 채우므로 Radio의 흰색 이동 표시를 숨긴다. */}
        <Radio
          aria-labelledby="builder-scope-label"
          value={scope}
          onChange={(value) => onScope(value as TSkillPublishScope)}
          options={[
            { value: 'all', label: localize('com_skills_scope_all') },
            { value: 'team', label: localize('com_skills_scope_team') },
            { value: 'me', label: localize('com_skills_builder_scope_me') },
          ]}
          className="!rounded-full !border !border-border-light !bg-surface-primary !px-0 [&>div:first-child]:hidden"
          buttonClassName="!h-[30px] !rounded-full !px-[12.5px] !text-[13px] font-normal border-e border-border-light last:border-e-0 aria-checked:bg-surface-submit aria-checked:font-semibold aria-checked:text-text-on-status"
        />
      </div>
    </Block>
  );
}
