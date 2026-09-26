import React from 'react';
import type { TSkillSummary } from 'librechat-data-provider';
import {
  formatCount,
  getSkillSummary,
  getSkillTitle,
  runsOf,
  savedHoursOf,
} from './skillCategories';
import { SkillTags, byLine } from './SkillMeta';
import { useLocalize } from '~/hooks';
import SkillIcon from './SkillIcon';
import { cn } from '~/utils';

interface SkillRankRowProps {
  skill: TSkillSummary;
  /** 1부터 시작하는 순위. 없으면 번호 칸을 그리지 않는다. */
  rank?: number;
  userId?: string;
  /** 분류 탭처럼 By 줄에 실행 수와 원본 이름을 붙일지. */
  detailedByLine?: boolean;
  originTitle?: string | null;
  onSelect: (skill: TSkillSummary) => void;
}

/** 와이어프레임 `ritem`: 번호 · 아이콘 · 이름과 태그 · 설명 · By 줄 · 실행 / 절감 시간 / 회당 단축. */
export default function SkillRankRow({
  skill,
  rank,
  userId,
  detailedByLine = false,
  originTitle,
  onSelect,
}: SkillRankRowProps) {
  const localize = useLocalize();
  const title = getSkillTitle(skill);
  const savedHours = savedHoursOf(skill);
  const perRun = skill.usageMetrics?.savedMinutesPerRun ?? null;
  const averageSeconds = skill.usageMetrics?.averageRunSeconds ?? null;

  return (
    <div role="gridcell">
      <div
        role="button"
        tabIndex={0}
        aria-label={title}
        onClick={() => onSelect(skill)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(skill);
          }
        }}
        className="group flex cursor-pointer items-center gap-3.5 rounded-[18px] px-2.5 py-3 hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
      >
        {rank !== undefined && (
          <span
            className={cn(
              'w-6 flex-none text-center text-[17px] font-extrabold tabular-nums',
              rank <= 3
                ? 'bg-gradient-to-br from-[#8b5cf6] to-[#db2777] bg-clip-text text-transparent'
                : 'text-[rgb(var(--border-heavy))]',
            )}
          >
            {rank}
          </span>
        )}
        <SkillIcon skill={skill} className="group-hover:-rotate-[8deg] group-hover:scale-[1.08]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[15.5px] font-bold text-text-primary">
            {title}
            <SkillTags skill={skill} userId={userId} />
          </div>
          <div className="mt-0.5 line-clamp-1 text-[13.5px] leading-[1.45] text-text-tertiary">
            {getSkillSummary(skill)}
          </div>
          <div className="mt-[3px] text-xs text-text-muted">
            {byLine(skill, localize, { withRuns: detailedByLine, originTitle })}
          </div>
        </div>
        <div
          className="grid flex-none grid-cols-[repeat(3,60px)] gap-1 text-right md:grid-cols-[repeat(3,76px)]"
          title={localize('com_skills_perf_formula', {
            manual: skill.manualMinutes ?? 0,
            seconds: averageSeconds ?? 0,
          })}
        >
          <PerfCell
            strong
            value={formatCount(runsOf(skill))}
            label={localize('com_skills_perf_runs')}
          />
          <PerfCell
            value={savedHours == null ? '–' : `${formatCount(savedHours)}h`}
            label={localize('com_skills_perf_saved')}
          />
          <PerfCell
            value={
              perRun == null ? '–' : localize('com_skills_minutes', { count: Math.round(perRun) })
            }
            label={localize('com_skills_perf_per_run')}
          />
        </div>
      </div>
    </div>
  );
}

function PerfCell({
  value,
  label,
  strong = false,
}: {
  value: string;
  label: string;
  strong?: boolean;
}) {
  return (
    <div>
      <b
        className={cn(
          'block tabular-nums tracking-[-0.02em] text-text-primary',
          strong ? 'text-lg font-extrabold' : 'text-base font-bold',
        )}
      >
        {value}
      </b>
      <small className="text-[11px] text-text-muted">{label}</small>
    </div>
  );
}
