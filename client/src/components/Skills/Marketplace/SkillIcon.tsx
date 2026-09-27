import type { TSkillSummary } from 'librechat-data-provider';
import { hueOf } from './skillCategories';
import { cn } from '~/utils';

export const DEFAULT_SKILL_ICON = '🤖';

/** 만들기 폼과 편집기가 함께 쓰는 아이콘 선택지. */
export const SKILL_ICON_CHOICES: readonly string[] = [
  DEFAULT_SKILL_ICON,
  '📈',
  '🌍',
  '📅',
  '✈️',
  '🗓️',
  '📋',
  '📊',
  '🎤',
  '🧾',
];

/** 이모지 글꼴을 먼저 고른다. 없으면 본문 글꼴이 빈칸을 그려 아이콘 자리가 빈 원으로 보인다. */
export const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

const SIZE_CLASSES = {
  s: 'size-[46px] text-[23px]',
  m: 'size-[68px] text-[34px]',
  l: 'size-[92px] text-[46px] shadow-[0_0_0_6px_rgb(var(--surface-primary)),0_0_0_7px_rgb(var(--border-light))]',
};

interface SkillIconProps {
  skill: Pick<TSkillSummary, 'name' | 'icon'>;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

/** 이모지를 이름으로 정한 옅은 색 원 안에 둔다. */
export default function SkillIcon({ skill, size = 's', className }: SkillIconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex flex-none select-none items-center justify-center rounded-full leading-none transition-transform duration-200',
        SIZE_CLASSES[size],
        className,
      )}
      style={{ background: `hsl(${hueOf(skill.name)} 85% 93%)`, fontFamily: EMOJI_FONT }}
    >
      {skill.icon || DEFAULT_SKILL_ICON}
    </span>
  );
}
