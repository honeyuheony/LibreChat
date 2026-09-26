import type { TSkillSummary } from 'librechat-data-provider';
import { hueOf } from './skillCategories';
import { cn } from '~/utils';

const DEFAULT_ICON = '🤖';
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

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

/** 이모지를 이름으로 정한 옅은 색 원 안에 둔다(와이어프레임 `aico`). */
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
      {skill.icon || DEFAULT_ICON}
    </span>
  );
}
