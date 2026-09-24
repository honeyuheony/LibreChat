import type { TSkillCategoryCount, TSkillSummary } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';

export const ALL_CATEGORY = 'all';

/** Category values the deployment skills use (docs/agent-market-plan.md 3절). Anything
 *  else still shows up as a tab, labelled by its raw value. */
const CATEGORY_LABEL_KEYS: Record<string, TranslationKeys> = {
  general: 'com_skills_category_general',
  hr: 'com_skills_category_hr',
  rd: 'com_skills_category_rd',
  finance: 'com_skills_category_finance',
  it: 'com_skills_category_it',
  sales: 'com_skills_category_sales',
  aftersales: 'com_skills_category_aftersales',
};

export function getCategoryLabel(
  value: string,
  localize: (key: TranslationKeys) => string,
): string {
  if (value === ALL_CATEGORY) {
    return localize('com_skills_all');
  }
  const key = CATEGORY_LABEL_KEYS[value];
  return key ? localize(key) : value;
}

/** Builds the tab list from `GET /api/skills/categories`' counts: known categories first
 *  in their fixed order, then any others, ignoring the empty `''` (no-category) bucket. */
export function collectCategories(categoryCounts: TSkillCategoryCount[]): string[] {
  const present = new Set(
    categoryCounts.filter((entry) => entry.value.length > 0).map((entry) => entry.value),
  );
  const known = Object.keys(CATEGORY_LABEL_KEYS).filter((value) => present.has(value));
  const others = Array.from(present)
    .filter((value) => !(value in CATEGORY_LABEL_KEYS))
    .sort();
  return [ALL_CATEGORY, ...known, ...others];
}

export function getSkillTitle(skill: TSkillSummary): string {
  return skill.displayTitle ?? skill.name;
}

const SUMMARY_LEAD_PHRASE_MAX_LENGTH = 40;

/** Strips a leading "<제목 구절>: " (a Korean title phrase followed by a colon and a space)
 *  from the description when the skill has a `displayTitle`: that lead phrase mirrors the
 *  title for the `$` skill panel's list view, and repeating it here duplicates the card/detail
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

export function filterSkills(
  skills: TSkillSummary[],
  category: string,
  query: string,
): TSkillSummary[] {
  const q = query.trim().toLowerCase();
  return skills.filter((skill) => {
    if (category !== ALL_CATEGORY && skill.category !== category) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      skill.name.toLowerCase().includes(q) ||
      getSkillTitle(skill).toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q)
    );
  });
}
