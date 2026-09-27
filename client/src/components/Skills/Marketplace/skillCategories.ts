import type { TSkillSummary } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';

/** 분류 값은 SKILL.md `category`와 만들기 폼이 그대로 저장하는 한국어 4종이다. */
export const SKILL_CATEGORIES = ['문서작성', '정리·분석', '검토', '번역·교정'] as const;

export const POPULAR_TAB = 'popular';
export const MINE_TAB = 'mine';
export const PACKS_TAB = 'packs';

const CATEGORY_LABEL_KEYS: Record<string, TranslationKeys> = {
  문서작성: 'com_skills_category_writing',
  '정리·분석': 'com_skills_category_analysis',
  검토: 'com_skills_category_review',
  '번역·교정': 'com_skills_category_translation',
};

export function getCategoryLabel(
  value: string,
  localize: (key: TranslationKeys) => string,
): string {
  const key = CATEGORY_LABEL_KEYS[value];
  return key ? localize(key) : value;
}

export function getSkillTitle(skill: TSkillSummary): string {
  return skill.displayTitle ?? skill.name;
}

const SUMMARY_LEAD_PHRASE_MAX_LENGTH = 40;

/** Strips a leading "<제목 구절>: " (a Korean title phrase followed by a colon and a space)
 *  from the description when the skill has a `displayTitle`: that lead phrase mirrors the
 *  title for the `/` skill panel's list view, and repeating it here duplicates the row/detail
 *  title shown right above the description. */
export function getSkillSummary(skill: TSkillSummary): string {
  if (!skill.displayTitle) {
    return skill.description;
  }
  const separatorIndex = skill.description.indexOf(': ');
  if (separatorIndex === -1 || separatorIndex > SUMMARY_LEAD_PHRASE_MAX_LENGTH) {
    return skill.description;
  }
  return skill.description.slice(separatorIndex + 2);
}

/** 전 부서에 주는 기본 agent. 사용자 스킬과 `kind`가 없는 배포 스킬은 직원이 만든 agent로 본다. */
export function isBaseSkill(skill: TSkillSummary): boolean {
  return skill.marketProfile?.kind === '기본';
}

export function isOwnSkill(skill: TSkillSummary, userId: string | undefined): boolean {
  return !!userId && skill.source !== 'deployment' && skill.author === userId;
}

export function runsOf(skill: TSkillSummary): number {
  return skill.useCount ?? 0;
}

/** 수작업 분이나 측정 기록이 없으면 서버가 null 을 준다. */
export function savedHoursOf(skill: TSkillSummary): number | null {
  return skill.usageMetrics?.savedHours ?? null;
}

export function sortByRuns(skills: TSkillSummary[]): TSkillSummary[] {
  return skills.slice().sort((a, b) => runsOf(b) - runsOf(a));
}

export function sumSavedHours(skills: TSkillSummary[]): number {
  return skills.reduce((sum, skill) => sum + (savedHoursOf(skill) ?? 0), 0);
}

const NEW_SKILL_DAYS = 14;

/** 배포 스킬의 createdAt 은 배포 때 파일이 생긴 시각이라 신규를 가리지 못하므로 사용자 스킬만 본다. */
export function isNewSkill(skill: TSkillSummary, now: number = Date.now()): boolean {
  if (skill.source === 'deployment') {
    return false;
  }
  const created = Date.parse(skill.createdAt);
  return Number.isFinite(created) && now - created < NEW_SKILL_DAYS * 86_400_000;
}

/** 와이어프레임 `hueOf`와 같은 식이다. */
export function hueOf(seed: string): number {
  let hue = 0;
  for (const char of seed) {
    hue = (hue * 31 + char.charCodeAt(0)) % 360;
  }
  return hue;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('ko-KR');
}
