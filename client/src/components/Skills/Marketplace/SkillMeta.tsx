import type { TSkillSummary } from 'librechat-data-provider';
import { isBaseSkill, isNewSkill, isOwnSkill, formatCount, runsOf } from './skillCategories';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type Localize = ReturnType<typeof useLocalize>;
type PublicationScope = NonNullable<TSkillSummary['scope']>;

const TAG_CLASS = 'whitespace-nowrap rounded-full px-[7px] py-px text-[10.5px] font-bold';

function publicationScope(skill: TSkillSummary): PublicationScope | undefined {
  if (skill.scope != null) {
    return skill.scope;
  }
  switch (skill.marketProfile?.scope) {
    case 'all':
    case '전 부서':
      return 'all';
    case 'team':
    case '팀':
      return 'team';
    case 'me':
    case '나만':
      return 'me';
    default:
      return undefined;
  }
}

export function visibilityLabel(skill: TSkillSummary, localize: Localize): string {
  const scope = publicationScope(skill);
  if (scope === 'team') {
    return skill.scopeDepartment
      ? localize('com_skills_scope_team_department', { department: skill.scopeDepartment })
      : localize('com_skills_scope_team');
  }
  if (scope === 'me') {
    return localize('com_skills_scope_me');
  }
  if (scope === 'all') {
    return localize('com_skills_scope_all');
  }
  return skill.marketProfile?.scope ?? localize('com_skills_scope_all');
}

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

/** 마켓에서 소유·상태·공개 범위를 보여 준다. */
export function SkillTags({ skill, userId }: { skill: TSkillSummary; userId?: string }) {
  const localize = useLocalize();
  const scope = publicationScope(skill);
  return (
    <>
      {isOwnSkill(skill, userId) && <Tag tone="mine">{localize('com_skills_tag_mine')}</Tag>}
      {isNewSkill(skill) && <Tag tone="new">{localize('com_skills_tag_new')}</Tag>}
      {skill.forkOf && <Tag tone="fork">{localize('com_skills_tag_fork')}</Tag>}
      {scope === 'team' && (
        <Tag tone="team">
          {skill.scopeDepartment
            ? localize('com_skills_scope_team_department', { department: skill.scopeDepartment })
            : localize('com_skills_tag_team')}
        </Tag>
      )}
      {scope === 'me' && <Tag tone="team">{localize('com_skills_scope_me')}</Tag>}
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

/** 순위 행의 By 줄. `withRuns`면 분류 탭처럼 실행 수와 원본 이름까지 붙인다. */
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
