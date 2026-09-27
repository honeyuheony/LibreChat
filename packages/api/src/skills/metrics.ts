import { logger } from '@librechat/data-schemas';
import type { TSkillMarketProfile, TSkillSummary } from 'librechat-data-provider';
import type { Response } from 'express';
import type { SkillSeedMetrics, SkillUsageCountersInput } from './market';
import type { ServerRequest } from '~/types';
import { computeSkillUsageMetrics } from './usage';
import { applyDeploymentUsage } from './market';

type SkillIdValue = { toString(): string };

export type MetricsUserSkill = {
  _id: SkillIdValue;
  name: string;
  displayTitle?: string;
  author: SkillIdValue;
  authorName: string;
  useCount?: number;
  runTimeTotalSeconds?: number;
  runTimeSampleCount?: number;
  manualMinutes?: number;
  forkOf?: SkillIdValue | null;
};

export type MetricsDeploymentSkill = {
  _id: SkillIdValue;
  name: string;
  displayTitle?: string;
  description: string;
  author: SkillIdValue;
  authorName: string;
  authorDepartment?: string;
  manualMinutes?: number;
  forkOf?: SkillIdValue;
  seedMetrics?: SkillSeedMetrics;
  marketProfile?: TSkillMarketProfile;
};

export type SkillMetricsInput = {
  userSkills: MetricsUserSkill[];
  deploymentSkills: MetricsDeploymentSkill[];
  publishedForks: Record<string, number>;
  deploymentUsage: Record<string, SkillUsageCountersInput>;
  authorDepartments: Record<string, string>;
};

export type SkillMetricsAgent = {
  id: string;
  name: string;
  displayTitle?: string;
  authorName: string;
  authorDepartment?: string;
  runs: number;
  forks: number;
  savedHours: number;
};

export type SkillMetricsContributor = {
  authorName: string;
  department?: string;
  agents: number;
  runs: number;
  forks: number;
  savedHours: number;
};

export type SkillMetricsReport = {
  agents: { total: number; base: number; staff: number };
  runs: { total: number; staff: number };
  forks: { total: number; forkedAgents: number };
  savedHours: { total: number; staff: number };
  ranking: SkillMetricsAgent[];
  baseTotal: {
    count: number;
    authorName?: string;
    runs: number;
    forks: number;
    savedHours: number;
  };
  contributors: SkillMetricsContributor[];
};

export type SkillMetricsDeps = {
  listUserSkills: () => Promise<MetricsUserSkill[]>;
  listDeploymentSkills: () => MetricsDeploymentSkill[];
  countPublishedForks: (skillIds: string[]) => Promise<Record<string, number>>;
  getDeploymentSkillUsage: (skillIds: string[]) => Promise<Record<string, SkillUsageCountersInput>>;
  getSkillAuthorDepartments: (authorIds: string[]) => Promise<Record<string, string>>;
};

const BASE_KIND = '기본';
const RANKING_SIZE = 8;

type MetricsRow = SkillMetricsAgent & { isBase: boolean; isFork: boolean };

type MetricsTotals = { runs: number; forks: number; savedHours: number };

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function sumTotals(rows: MetricsRow[]): MetricsTotals {
  const totals = rows.reduce(
    (sum, row) => ({
      runs: sum.runs + row.runs,
      forks: sum.forks + row.forks,
      savedHours: sum.savedHours + row.savedHours,
    }),
    { runs: 0, forks: 0, savedHours: 0 },
  );
  return { ...totals, savedHours: roundToTenth(totals.savedHours) };
}

function byRunsThenName(a: { runs: number; name: string }, b: { runs: number; name: string }) {
  return b.runs - a.runs || a.name.localeCompare(b.name);
}

/** `applyDeploymentUsage`는 스킬 요약 모양을 받으므로 지표 계산에 쓰는 값만 채워 넘긴다. */
function toDeploymentRow(skill: MetricsDeploymentSkill, input: SkillMetricsInput): MetricsRow {
  const id = skill._id.toString();
  const seed = skill.seedMetrics;
  const summary: TSkillSummary = {
    _id: id,
    name: skill.name,
    description: skill.description,
    author: skill.author.toString(),
    authorName: skill.authorName,
    version: 1,
    source: 'deployment',
    fileCount: 0,
    createdAt: '',
    updatedAt: '',
    manualMinutes: skill.manualMinutes,
  };
  const usage = applyDeploymentUsage(summary, seed, input.deploymentUsage[id]);
  return {
    id,
    name: skill.name,
    ...(skill.displayTitle !== undefined && { displayTitle: skill.displayTitle }),
    authorName: skill.authorName,
    ...(skill.authorDepartment !== undefined && { authorDepartment: skill.authorDepartment }),
    runs: usage.useCount ?? 0,
    forks: (seed?.forks ?? 0) + (input.publishedForks[id] ?? 0),
    savedHours: usage.usageMetrics?.savedHours ?? 0,
    isBase: skill.marketProfile?.kind === BASE_KIND,
    isFork: skill.forkOf != null,
  };
}

function toUserRow(skill: MetricsUserSkill, input: SkillMetricsInput): MetricsRow {
  const id = skill._id.toString();
  const authorDepartment = input.authorDepartments[skill.author.toString()];
  return {
    id,
    name: skill.name,
    ...(skill.displayTitle !== undefined && { displayTitle: skill.displayTitle }),
    authorName: skill.authorName,
    ...(authorDepartment !== undefined && { authorDepartment }),
    runs: Math.max(0, skill.useCount ?? 0),
    forks: input.publishedForks[id] ?? 0,
    savedHours: computeSkillUsageMetrics(skill).savedHours ?? 0,
    isBase: false,
    isFork: skill.forkOf != null,
  };
}

function toAgent({ isBase: _isBase, isFork: _isFork, ...agent }: MetricsRow): SkillMetricsAgent {
  return agent;
}

/** 와이어프레임처럼 작성자 이름과 부서가 같으면 한 사람으로 묶는다. */
function groupContributors(rows: MetricsRow[]): SkillMetricsContributor[] {
  const byAuthor = new Map<string, SkillMetricsContributor>();
  for (const row of rows) {
    const key = `${row.authorName}\u0000${row.authorDepartment ?? ''}`;
    const current = byAuthor.get(key) ?? {
      authorName: row.authorName,
      ...(row.authorDepartment !== undefined && { department: row.authorDepartment }),
      agents: 0,
      runs: 0,
      forks: 0,
      savedHours: 0,
    };
    byAuthor.set(key, {
      ...current,
      agents: current.agents + 1,
      runs: current.runs + row.runs,
      forks: current.forks + row.forks,
      savedHours: roundToTenth(current.savedHours + row.savedHours),
    });
  }
  return Array.from(byAuthor.values()).sort(
    (a, b) => b.runs - a.runs || a.authorName.localeCompare(b.authorName),
  );
}

/**
 * 운영 현황 지표. 「기본」은 배포 스킬 가운데 `kind: 기본`, 나머지(사용자 스킬 포함)는 직원 제작이다.
 * 측정 기록이 없어 절감 시간이 비어 있는 스킬은 합계에 0으로 더한다.
 */
export function computeSkillMetrics(input: SkillMetricsInput): SkillMetricsReport {
  const rows = [
    ...input.deploymentSkills.map((skill) => toDeploymentRow(skill, input)),
    ...input.userSkills.map((skill) => toUserRow(skill, input)),
  ];
  const baseRows = rows.filter((row) => row.isBase);
  const staffRows = rows.filter((row) => !row.isBase);
  const base = sumTotals(baseRows);
  const staff = sumTotals(staffRows);
  return {
    agents: { total: rows.length, base: baseRows.length, staff: staffRows.length },
    runs: { total: base.runs + staff.runs, staff: staff.runs },
    forks: {
      total: base.forks + staff.forks,
      forkedAgents: rows.filter((row) => row.isFork).length,
    },
    savedHours: {
      total: roundToTenth(base.savedHours + staff.savedHours),
      staff: staff.savedHours,
    },
    ranking: staffRows.slice().sort(byRunsThenName).slice(0, RANKING_SIZE).map(toAgent),
    baseTotal: {
      count: baseRows.length,
      ...(baseRows.length > 0 && { authorName: baseRows[0].authorName }),
      ...base,
    },
    contributors: groupContributors(staffRows),
  };
}

/** 공개 범위와 관계없이 모든 스킬을 읽는다. 응용 수는 게시된 응용본만 센다(`countPublishedForks`). */
export async function collectSkillMetrics(deps: SkillMetricsDeps): Promise<SkillMetricsReport> {
  const deploymentSkills = deps.listDeploymentSkills();
  const deploymentIds = deploymentSkills.map((skill) => skill._id.toString());
  const [userSkills, deploymentUsage] = await Promise.all([
    deps.listUserSkills(),
    deploymentIds.length > 0
      ? deps.getDeploymentSkillUsage(deploymentIds)
      : Promise.resolve<Record<string, SkillUsageCountersInput>>({}),
  ]);
  const skillIds = [...deploymentIds, ...userSkills.map((skill) => skill._id.toString())];
  const authorIds = [...new Set(userSkills.map((skill) => skill.author.toString()))];
  const [publishedForks, authorDepartments] = await Promise.all([
    skillIds.length > 0 ? deps.countPublishedForks(skillIds) : Promise.resolve({}),
    authorIds.length > 0 ? deps.getSkillAuthorDepartments(authorIds) : Promise.resolve({}),
  ]);
  return computeSkillMetrics({
    userSkills,
    deploymentSkills,
    publishedForks,
    deploymentUsage,
    authorDepartments,
  });
}

export function createSkillMetricsHandler(
  deps: SkillMetricsDeps,
): (req: ServerRequest, res: Response) => Promise<Response> {
  return async (_req, res) => {
    try {
      return res.status(200).json(await collectSkillMetrics(deps));
    } catch (error) {
      logger.error('[GET /admin/skills/metrics] Error collecting skill metrics', error);
      return res.status(500).json({ error: 'Error collecting skill metrics' });
    }
  };
}
