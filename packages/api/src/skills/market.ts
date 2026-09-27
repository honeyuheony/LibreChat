import type { TSkillMarketProfile, TSkillSummary } from 'librechat-data-provider';
import { computeSkillUsageMetrics } from './usage';

/** 시연용 출발 지표(`metadata.seedMetrics`). `runSeconds`는 그 실행들의 평균 실행 시간(초)이다. */
export type SkillSeedMetrics = {
  runs: number;
  forks: number;
  runSeconds: number;
};

/** 배포 스킬 SKILL.md `metadata`에서 마켓 화면에 쓰는 값만 골라 정리한 것. */
export type DeploymentMarketFields = {
  icon?: string;
  /** 작성자 표시 이름. 기본 agent 는 팀 이름, 공유 agent 는 사람 이름이다. */
  owner?: string;
  department?: string;
  manualMinutes?: number;
  /** 원본 agent 의 이름(slug). 로딩이 끝난 뒤 id로 바꾼다. */
  forkOfName?: string;
  seedMetrics?: SkillSeedMetrics;
  marketProfile?: TSkillMarketProfile;
};

/** 배포 스킬 실행 기록의 원래 값(`DeploymentSkillUsage` 한 줄). */
export type SkillUsageCountersInput = {
  useCount: number;
  runTimeTotalSeconds: number;
  runTimeSampleCount: number;
};

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const list = value.map(readString).filter((entry): entry is string => entry !== undefined);
  return list.length > 0 ? list : undefined;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readSeedMetrics(value: unknown): SkillSeedMetrics | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const runs = readNonNegativeNumber(raw.runs);
  const forks = readNonNegativeNumber(raw.forks);
  const runSeconds = readNonNegativeNumber(raw.runSeconds);
  if (runs === undefined && forks === undefined) {
    return undefined;
  }
  return {
    runs: Math.floor(runs ?? 0),
    forks: Math.floor(forks ?? 0),
    runSeconds: runSeconds ?? 0,
  };
}

function compactProfile(profile: TSkillMarketProfile): TSkillMarketProfile | undefined {
  const entries = Object.entries(profile).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as TSkillMarketProfile) : undefined;
}

/** SKILL.md 머리말 `metadata`를 읽는다. 모양이 틀린 값은 버린다. */
export function readDeploymentMarketFields(
  frontmatter: Record<string, unknown>,
): DeploymentMarketFields {
  const metadata = frontmatter.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const raw = metadata as Record<string, unknown>;
  const manualMinutes = readNonNegativeNumber(raw.manualMinutes);
  const fields: DeploymentMarketFields = {
    icon: readString(raw.icon),
    owner: readString(raw.owner),
    department: readString(raw.department),
    manualMinutes: manualMinutes === undefined ? undefined : Math.round(manualMinutes),
    forkOfName: readString(raw.forkOf),
    seedMetrics: readSeedMetrics(raw.seedMetrics),
    marketProfile: compactProfile({
      kind: readString(raw.kind),
      scope: readString(raw.scope),
      version: readString(raw.version),
      triggers: readStringList(raw.triggers),
      pipeline: readString(raw.pipeline),
      output: readString(raw.output),
      sources: readStringList(raw.sources),
      base: readString(raw.base),
    }),
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as DeploymentMarketFields;
}

/** 표시 지표 = 출발값(평균 `runSeconds`초로 `runs`번 실행한 기록으로 셈) + 실제로 쌓인 기록. */
export function applyDeploymentUsage<T extends TSkillSummary>(
  skill: T,
  seed: SkillSeedMetrics | undefined,
  stored: SkillUsageCountersInput | undefined,
): T {
  const seedRuns = seed?.runs ?? 0;
  const useCount = seedRuns + (stored?.useCount ?? 0);
  const runTimeTotalSeconds =
    seedRuns * (seed?.runSeconds ?? 0) + (stored?.runTimeTotalSeconds ?? 0);
  const runTimeSampleCount =
    (seed && seed.runSeconds > 0 ? seedRuns : 0) + (stored?.runTimeSampleCount ?? 0);
  return {
    ...skill,
    useCount,
    runTimeTotalSeconds,
    runTimeSampleCount,
    usageMetrics: computeSkillUsageMetrics({
      useCount,
      runTimeTotalSeconds,
      runTimeSampleCount,
      manualMinutes: skill.manualMinutes,
    }),
  };
}

const TEAM_SCOPE = '팀';

/** user 스키마의 `department`는 없을 수도 있으므로 문자열일 때만 쓴다. */
export function readUserDepartment(user: unknown): string | undefined {
  if (!user || typeof user !== 'object') {
    return undefined;
  }
  return readString((user as { department?: unknown }).department);
}

/** `scope: 팀` agent 는 작성자와 같은 부서 사용자에게만 보인다. */
export function isVisibleToDepartment(
  skill: { marketProfile?: TSkillMarketProfile; authorDepartment?: string },
  userDepartment: string | undefined,
): boolean {
  if (skill.marketProfile?.scope !== TEAM_SCOPE) {
    return true;
  }
  return userDepartment !== undefined && userDepartment === skill.authorDepartment;
}

/** 배포 스킬을 요청한 사용자에게 보이거나 불러와도 되는지. 개별 조회와 실행 로딩이 함께 쓴다. */
export function isDeploymentSkillVisibleTo(
  skill: { marketProfile?: TSkillMarketProfile; authorDepartment?: string },
  user: unknown,
): boolean {
  return isVisibleToDepartment(skill, readUserDepartment(user));
}
