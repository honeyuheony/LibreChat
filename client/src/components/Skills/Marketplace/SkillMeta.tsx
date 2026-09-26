import type { TSkillSummary } from 'librechat-data-provider';
import { isBaseSkill, isNewSkill, isOwnSkill, formatCount, runsOf } from './skillCategories';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type Localize = ReturnType<typeof useLocalize>;

const TAG_CLASS = 'whitespace-nowrap rounded-full px-[7px] py-px text-[10.5px] font-bold';

export function Tag({
  tone,
  children,
}: {
  tone: 'mine' | 'new' | 'fork' | 'team';
  children: string;
}) {
  return (
    <span
      className={cn(
        TAG_CLASS,
        tone === 'mine' && 'bg-text-primary text-surface-primary',
        tone === 'new' && 'bg-[#dcfce7] text-[#166534]',
        tone === 'fork' && 'bg-[#ede9fe] text-[#5b21b6]',
        tone === 'team' && 'bg-[#fef3c7] text-[#92400e]',
      )}
    >
      {children}
    </span>
  );
}

/** 와이어프레임 `tagsOf`: 내 agent · 신규 · 응용 · 우리 팀. */
export function SkillTags({ skill, userId }: { skill: TSkillSummary; userId?: string }) {
  const localize = useLocalize();
  return (
    <>
      {isOwnSkill(skill, userId) && <Tag tone="mine">{localize('com_skills_tag_mine')}</Tag>}
      {isNewSkill(skill) && <Tag tone="new">{localize('com_skills_tag_new')}</Tag>}
      {skill.forkOf && <Tag tone="fork">{localize('com_skills_tag_fork')}</Tag>}
      {skill.marketProfile?.scope === '팀' && (
        <Tag tone="team">{localize('com_skills_tag_team')}</Tag>
      )}
    </>
  );
}

/** 「By 작성자 · 부서」. 기본 agent 는 목록에서 플랫폼 이름으로, 상세 창에서 플랫폼 이름과 제공 팀으로 적는다. */
export function authorLine(skill: TSkillSummary, localize: Localize, detail = false): string {
  if (isBaseSkill(skill)) {
    return detail
      ? localize('com_skills_by_platform_team', { team: skill.authorName })
      : localize('com_skills_by_platform');
  }
  return skill.authorDepartment
    ? localize('com_skills_by_author_department', {
        author: skill.authorName,
        department: skill.authorDepartment,
      })
    : localize('com_skills_by_author_only', { author: skill.authorName });
}

/** 순위 행의 By 줄. `withRuns`면 분류 탭처럼 실행 수와 원본 이름까지 붙인다(와이어프레임 `byLine`). */
export function byLine(
  skill: TSkillSummary,
  localize: Localize,
  options: { withRuns: boolean; originTitle?: string | null },
): string {
  const parts = [authorLine(skill, localize)];
  if (options.withRuns) {
    parts.push(localize('com_skills_meta_runs', { value: formatCount(runsOf(skill)) }));
  }
  if (skill.forkCount) {
    parts.push(localize('com_skills_meta_forks', { value: formatCount(skill.forkCount) }));
  }
  // originTitle: undefined 는 원본을 모름(적지 않음), null 은 원본이 목록에 없음(삭제됨).
  if (options.withRuns && skill.forkOf && options.originTitle !== undefined) {
    parts.push(
      localize('com_skills_meta_origin', {
        title: options.originTitle ?? localize('com_skills_origin_deleted'),
      }),
    );
  }
  return parts.join(' · ');
}
