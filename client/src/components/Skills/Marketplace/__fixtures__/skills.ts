import type { TSkillSummary } from 'librechat-data-provider';

export const CURRENT_USER_ID = 'user-hong';

let sequence = 0;

export function makeSkill(overrides: Partial<TSkillSummary> & { name: string }): TSkillSummary {
  sequence += 1;
  return {
    _id: `skill-${sequence}`,
    displayTitle: overrides.name,
    description: `${overrides.name} description`,
    author: 'deployment-author',
    authorName: 'Deployment',
    version: 1,
    source: 'deployment',
    fileCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as TSkillSummary;
}

export const baseReport = makeSkill({
  name: 'hwp-report',
  displayTitle: 'hwp로 보고서 작성',
  category: '문서작성',
  icon: '📄',
  authorName: '디지털혁신팀',
  authorDepartment: '전 부서 기본',
  useCount: 2140,
  manualMinutes: 41,
  forkCount: 31,
  usageMetrics: { averageRunSeconds: 40, savedMinutesPerRun: 40.3, savedHours: 1438.2 },
  marketProfile: { kind: '기본', scope: '전 부서' },
});

export const weekly = makeSkill({
  name: 'weekly-report',
  displayTitle: '주간보고 작성',
  category: '문서작성',
  icon: '📅',
  authorName: '박지원',
  authorDepartment: '운영지원팀',
  useCount: 3120,
  manualMinutes: 26,
  forkCount: 41,
  usageMetrics: { averageRunSeconds: 40, savedMinutesPerRun: 25.3, savedHours: 1317.3 },
  marketProfile: { kind: '공유', scope: '전 부서', triggers: ['주간보고'], output: 'HWP 문서' },
});

export const weeklyFork = makeSkill({
  name: 'weekly-report-exchange-coop',
  displayTitle: '주간보고 작성 (교류협력팀)',
  category: '문서작성',
  authorName: '이협력',
  authorDepartment: '교류협력팀',
  useCount: 412,
  forkOf: weekly._id,
  usageMetrics: { averageRunSeconds: 40, savedMinutesPerRun: 30.3, savedHours: 208.3 },
  marketProfile: { kind: '공유', scope: '전 부서' },
});

export const riskCheck = makeSkill({
  name: 'situation-risk-check',
  displayTitle: '정세 위험 요인 점검',
  category: '검토',
  authorName: '최분석',
  authorDepartment: '정세분석팀',
  useCount: 932,
  usageMetrics: { averageRunSeconds: 40, savedMinutesPerRun: 60.3, savedHours: 937.1 },
  marketProfile: { kind: '공유', scope: '전 부서' },
});

export const myDraft = makeSkill({
  name: 'my-draft',
  displayTitle: '내 초안',
  category: '검토',
  author: CURRENT_USER_ID,
  authorName: '홍길동',
  source: 'inline',
  useCount: 3,
  usageMetrics: { averageRunSeconds: null, savedMinutesPerRun: null, savedHours: null },
});

export const ALL_SKILLS = [baseReport, weekly, weeklyFork, riskCheck, myDraft];
