import type { Response } from 'express';
import type {
  MetricsDeploymentSkill,
  MetricsUserSkill,
  SkillMetricsInput,
  SkillMetricsReport,
} from './metrics';
import type { ServerRequest } from '~/types';
import { collectSkillMetrics, computeSkillMetrics, createSkillMetricsHandler } from './metrics';

const BASE_OWNER = '디지털혁신팀';

function deployment(
  id: string,
  kind: string,
  owner: string,
  department: string | undefined,
  seed: { runs: number; forks: number; runSeconds: number },
  manualMinutes: number,
  forkOf?: string,
): MetricsDeploymentSkill {
  return {
    _id: id,
    name: id,
    description: `${id} 설명`,
    author: 'deployment-author',
    authorName: owner,
    ...(department !== undefined && { authorDepartment: department }),
    manualMinutes,
    seedMetrics: seed,
    marketProfile: { kind },
    ...(forkOf !== undefined && { forkOf }),
  };
}

/** `seconds`초짜리 실행을 `runs`번 측정한 사용자 스킬. `seconds`가 null이면 측정 기록이 없다. */
function userSkill(
  id: string,
  author: string,
  authorName: string,
  runs: number,
  seconds: number | null,
  manualMinutes: number,
  forkOf?: string,
): MetricsUserSkill {
  return {
    _id: id,
    name: id,
    author,
    authorName,
    useCount: runs,
    runTimeTotalSeconds: seconds === null ? 0 : runs * seconds,
    runTimeSampleCount: seconds === null ? 0 : runs,
    manualMinutes,
    ...(forkOf !== undefined && { forkOf }),
  };
}

/**
 * 기본 3개, 직원 제작 12개(배포 공유 2개 + DB 10개), 응용본 3개(d2·u9·u10), 측정 기록 없는 것 1개(u4).
 * u10은 게시하지 않은 「나만」 응용본이라 u1의 응용 수에 들어가지 않는다.
 * 실행 시간을 60초 배수로 두어 회당 단축 분과 절감 시간이 정수로 떨어진다.
 */
function fixture(): SkillMetricsInput {
  return {
    deploymentSkills: [
      deployment('b1', '기본', BASE_OWNER, undefined, { runs: 100, forks: 3, runSeconds: 60 }, 41),
      deployment('b2', '기본', BASE_OWNER, undefined, { runs: 60, forks: 1, runSeconds: 120 }, 17),
      deployment('b3', '기본', BASE_OWNER, undefined, { runs: 30, forks: 0, runSeconds: 60 }, 11),
      deployment('d1', '공유', '박지원', '운영지원팀', { runs: 300, forks: 2, runSeconds: 60 }, 26),
      deployment(
        'd2',
        '공유',
        '이협력',
        '교류협력팀',
        { runs: 60, forks: 0, runSeconds: 60 },
        31,
        'd1',
      ),
    ],
    userSkills: [
      userSkill('u1', 'userA', '김정세', 240, 60, 61),
      userSkill('u2', 'userA', '김정세', 180, 60, 46),
      userSkill('u3', 'userB', '최분석', 150, 120, 32),
      userSkill('u4', 'userB', '최분석', 120, null, 50),
      userSkill('u5', 'userC', '박지원', 90, 60, 21),
      userSkill('u6', 'userD', '무소속', 72, 60, 11),
      userSkill('u7', 'userA', '김정세', 36, 60, 6),
      userSkill('u8', 'userC', '박지원', 12, 60, 6),
      userSkill('u9', 'userD', '무소속', 6, 60, 11, 'd1'),
      userSkill('u10', 'userA', '김정세', 0, null, 30, 'u1'),
    ],
    publishedForks: { d1: 1 },
    deploymentUsage: { b1: { useCount: 20, runTimeTotalSeconds: 1200, runTimeSampleCount: 20 } },
    authorDepartments: { userA: '정세분석팀', userB: '정세분석팀', userC: '운영지원팀' },
  };
}

describe('computeSkillMetrics', () => {
  it('지표 네 칸을 기본·직원 제작으로 나눠 센다', () => {
    const report = computeSkillMetrics(fixture());

    expect(report.agents).toEqual({ total: 15, base: 3, staff: 12 });
    expect(report.runs).toEqual({ total: 1476, staff: 1266 });
    expect(report.forks).toEqual({ total: 7, forkedAgents: 2 });
    expect(report.savedHours).toEqual({ total: 752, staff: 652 });
  });

  it('직원 제작 agent 를 실행 수 내림차순으로 8개 싣는다', () => {
    const report = computeSkillMetrics(fixture());

    expect(report.ranking.map((agent) => agent.id)).toEqual([
      'd1',
      'u1',
      'u2',
      'u3',
      'u4',
      'u5',
      'u6',
      'd2',
    ]);
    expect(report.ranking[0]).toEqual({
      id: 'd1',
      name: 'd1',
      authorName: '박지원',
      authorDepartment: '운영지원팀',
      runs: 300,
      forks: 3,
      savedHours: 125,
    });
    expect(report.ranking[4]).toMatchObject({ id: 'u4', runs: 120, savedHours: null });
  });

  it('기본 agent 합계 줄은 기본 agent 들의 합과 작성자 값을 싣는다', () => {
    const report = computeSkillMetrics(fixture());

    expect(report.baseTotal).toEqual({
      count: 3,
      authorName: BASE_OWNER,
      runs: 210,
      forks: 4,
      savedHours: 100,
    });
  });

  it('기여자를 이름·부서로 묶어 실행 수 내림차순으로 싣는다', () => {
    const report = computeSkillMetrics(fixture());

    expect(report.contributors).toEqual([
      {
        authorName: '김정세',
        department: '정세분석팀',
        agents: 4,
        runs: 456,
        forks: 0,
        savedHours: 378,
      },
      {
        authorName: '박지원',
        department: '운영지원팀',
        agents: 3,
        runs: 402,
        forks: 3,
        savedHours: 156,
      },
      {
        authorName: '최분석',
        department: '정세분석팀',
        agents: 2,
        runs: 270,
        forks: 0,
        savedHours: 75,
      },
      { authorName: '무소속', agents: 2, runs: 78, forks: 0, savedHours: 13 },
      {
        authorName: '이협력',
        department: '교류협력팀',
        agents: 1,
        runs: 60,
        forks: 0,
        savedHours: 30,
      },
    ]);
  });

  it('스킬이 없으면 0과 빈 목록을 준다', () => {
    const report = computeSkillMetrics({
      deploymentSkills: [],
      userSkills: [],
      publishedForks: {},
      deploymentUsage: {},
      authorDepartments: {},
    });

    expect(report).toEqual<SkillMetricsReport>({
      agents: { total: 0, base: 0, staff: 0 },
      runs: { total: 0, staff: 0 },
      forks: { total: 0, forkedAgents: 0 },
      savedHours: { total: 0, staff: 0 },
      ranking: [],
      baseTotal: { count: 0, runs: 0, forks: 0, savedHours: 0 },
      contributors: [],
    });
  });

  it('평균 실행 시간이 60초 배수가 아니면 회당 단축 분을 반올림해 절감 시간을 낸다', () => {
    const report = computeSkillMetrics({
      deploymentSkills: [
        deployment(
          'd9',
          '공유',
          '서국제',
          '국제협력팀',
          { runs: 100, forks: 0, runSeconds: 90 },
          10,
        ),
      ],
      userSkills: [userSkill('u9', 'userA', '김정세', 100, 90, 10)],
      publishedForks: {},
      deploymentUsage: {},
      authorDepartments: {},
    });

    expect(report.ranking.map((agent) => agent.savedHours)).toEqual([15, 15]);
    expect(report.savedHours).toEqual({ total: 30, staff: 30 });
  });

  it('합계는 agent 별로 반올림한 절감 시간을 더한다', () => {
    const report = computeSkillMetrics({
      deploymentSkills: [],
      userSkills: [
        userSkill('u1', 'userA', '김정세', 2, 90, 10),
        userSkill('u2', 'userA', '김정세', 2, 90, 10),
      ],
      publishedForks: {},
      deploymentUsage: {},
      authorDepartments: {},
    });

    expect(report.ranking.map((agent) => agent.savedHours)).toEqual([0, 0]);
    expect(report.savedHours).toEqual({ total: 0, staff: 0 });
    expect(report.contributors[0].savedHours).toBe(0);
  });

  it('측정 기록이 없는 agent 는 절감 시간을 비워 두고 합계에는 0으로 더한다', () => {
    const report = computeSkillMetrics({
      deploymentSkills: [],
      userSkills: [
        userSkill('u1', 'userA', '김정세', 30, null, 10),
        userSkill('u2', 'userA', '김정세', 12, 60, 11),
      ],
      publishedForks: {},
      deploymentUsage: {},
      authorDepartments: {},
    });

    expect(report.ranking.map((agent) => agent.savedHours)).toEqual([null, 2]);
    expect(report.savedHours).toEqual({ total: 2, staff: 2 });
  });

  it('응용으로 생긴 agent 는 게시된 응용본과 배포 응용본만 센다', () => {
    const report = computeSkillMetrics({
      deploymentSkills: [
        deployment(
          'd1',
          '공유',
          '박지원',
          '운영지원팀',
          { runs: 10, forks: 0, runSeconds: 60 },
          11,
        ),
        deployment(
          'd2',
          '공유',
          '이협력',
          '교류협력팀',
          { runs: 5, forks: 0, runSeconds: 60 },
          11,
          'd1',
        ),
      ],
      userSkills: [
        userSkill('u1', 'userA', '김정세', 3, 60, 11, 'd1'),
        userSkill('u2', 'userA', '김정세', 0, null, 11, 'd1'),
      ],
      publishedForks: { d1: 1 },
      deploymentUsage: {},
      authorDepartments: {},
    });

    expect(report.forks).toEqual({ total: 1, forkedAgents: 2 });
  });

  it('실행 수가 같으면 이름순으로 순위를 정한다', () => {
    const report = computeSkillMetrics({
      deploymentSkills: [],
      userSkills: [
        userSkill('zeta', 'userA', '김정세', 10, 60, 11),
        userSkill('alpha', 'userA', '김정세', 10, 60, 11),
      ],
      publishedForks: {},
      deploymentUsage: {},
      authorDepartments: {},
    });

    expect(report.ranking.map((agent) => agent.id)).toEqual(['alpha', 'zeta']);
  });
});

/** 운영 현황 화면이 보여 주는 계산식을 그대로 옮긴 것이다. 서버 계산과 결과를 비교하는 기준으로 쓴다. */
type ScreenAgent = {
  id: string;
  kind: string;
  owner: string;
  dept: string;
  runs: number;
  forks: number;
  manualMin: number;
  runSec: number;
  forkOf?: string;
  saveMin?: number;
};

function recalcSave(x: ScreenAgent): void {
  x.saveMin = Math.max(0, Math.round(x.manualMin - (x.runSec || 0) / 60));
}

const savedH = (x: ScreenAgent): number => Math.round(((x.runs || 0) * (x.saveMin || 0)) / 60);

function renderMetrics(all: ScreenAgent[]) {
  const runs = all.reduce((a, x) => a + (x.runs || 0), 0);
  const forks = all.reduce((a, x) => a + (x.forks || 0), 0);
  const hrs = all.reduce((a, x) => a + savedH(x), 0);
  const shared = all.filter((x) => x.kind !== '기본');
  const top10 = shared
    .slice()
    .sort((a, b) => (b.runs || 0) - (a.runs || 0))
    .slice(0, 8);
  const by: Record<string, { n: number; runs: number; forks: number; h: number }> = {};
  shared.forEach((x) => {
    const k = x.owner + ' · ' + x.dept;
    by[k] = by[k] || { n: 0, runs: 0, forks: 0, h: 0 };
    by[k].n++;
    by[k].runs += x.runs || 0;
    by[k].forks += x.forks || 0;
    by[k].h += savedH(x);
  });
  const people = Object.entries(by).sort((a, b) => b[1].runs - a[1].runs);
  const sharedRuns = shared.reduce((a, x) => a + (x.runs || 0), 0);
  const sharedForks = shared.reduce((a, x) => a + (x.forks || 0), 0);
  const sharedHrs = shared.reduce((a, x) => a + savedH(x), 0);
  return {
    kpis: {
      agents: all.length,
      base: all.length - shared.length,
      staff: shared.length,
      runs,
      staffRuns: sharedRuns,
      forks,
      forkedAgents: all.filter((x) => x.forkOf).length,
      hours: hrs,
      staffHours: sharedHrs,
    },
    top: top10.map((x) => ({ id: x.id, runs: x.runs, forks: x.forks, hours: savedH(x) })),
    baseRow: {
      count: all.length - shared.length,
      runs: runs - sharedRuns,
      forks: forks - sharedForks,
      hours: hrs - sharedHrs,
    },
    people: people.map(([k, v]) => ({ key: k, n: v.n, runs: v.runs, forks: v.forks, h: v.h })),
  };
}

/**
 * 같은 입력을 화면 계산식이 받는 모양으로 옮긴다. 화면에는 게시한 응용본만 나오므로
 * `unpublishedForkIds`의 `forkOf`는 뺀다.
 */
function toScreenAgents(
  input: SkillMetricsInput,
  unpublishedForkIds: ReadonlySet<string> = new Set(['u10']),
): ScreenAgent[] {
  const deploymentAgents = input.deploymentSkills.map((skill) => {
    const id = skill._id.toString();
    const seed = skill.seedMetrics ?? { runs: 0, forks: 0, runSeconds: 0 };
    const stored = input.deploymentUsage[id];
    const runs = seed.runs + (stored?.useCount ?? 0);
    const totalSeconds = seed.runs * seed.runSeconds + (stored?.runTimeTotalSeconds ?? 0);
    const samples = seed.runs + (stored?.runTimeSampleCount ?? 0);
    return {
      id,
      kind: skill.marketProfile?.kind ?? '공유',
      owner: skill.authorName,
      dept: skill.authorDepartment ?? '',
      runs,
      forks: seed.forks + (input.publishedForks[id] ?? 0),
      manualMin: skill.manualMinutes ?? 0,
      runSec: samples > 0 ? totalSeconds / samples : 0,
      forkOf: skill.forkOf?.toString(),
    };
  });
  const userAgents = input.userSkills.map((skill) => {
    const id = skill._id.toString();
    const samples = skill.runTimeSampleCount ?? 0;
    return {
      id,
      kind: '공유',
      owner: skill.authorName,
      dept: input.authorDepartments[skill.author.toString()] ?? '',
      runs: skill.useCount ?? 0,
      forks: input.publishedForks[id] ?? 0,
      manualMin: skill.manualMinutes ?? 0,
      /* 측정 기록이 없으면 서버는 절감 시간을 0으로 더한다. 화면 계산식에서 같은 결과를 내려면
         수작업 분 전체가 실행 시간으로 걸린 것으로 둔다. */
      runSec:
        samples > 0 ? (skill.runTimeTotalSeconds ?? 0) / samples : (skill.manualMinutes ?? 0) * 60,
      forkOf: unpublishedForkIds.has(id) ? undefined : (skill.forkOf?.toString() ?? undefined),
    };
  });
  const agents = [...deploymentAgents, ...userAgents];
  agents.forEach(recalcSave);
  return agents;
}

describe('화면이 보여 주는 계산식과 서버 계산(computeSkillMetrics)이 같은지', () => {
  it('같은 입력으로 지표 네 칸·순위·기본 합계 줄·기여자 순위가 같다', () => {
    const base = fixture();
    const input: SkillMetricsInput = {
      ...base,
      deploymentSkills: [
        ...base.deploymentSkills,
        deployment(
          'd3',
          '공유',
          '서국제',
          '국제협력팀',
          { runs: 50, forks: 1, runSeconds: 45 },
          20,
        ),
      ],
      userSkills: [
        ...base.userSkills,
        userSkill('u11', 'userB', '최분석', 100, 90, 10),
        userSkill('u12', 'userB', '최분석', 1, 90, 10),
      ],
    };
    const screen = renderMetrics(toScreenAgents(input));
    const report = computeSkillMetrics(input);

    expect({
      agents: report.agents.total,
      base: report.agents.base,
      staff: report.agents.staff,
      runs: report.runs.total,
      staffRuns: report.runs.staff,
      forks: report.forks.total,
      forkedAgents: report.forks.forkedAgents,
      hours: report.savedHours.total,
      staffHours: report.savedHours.staff,
    }).toEqual(screen.kpis);
    expect(
      report.ranking.map((agent) => ({
        id: agent.id,
        runs: agent.runs,
        forks: agent.forks,
        hours: agent.savedHours ?? 0,
      })),
    ).toEqual(screen.top);
    expect({
      count: report.baseTotal.count,
      runs: report.baseTotal.runs,
      forks: report.baseTotal.forks,
      hours: report.baseTotal.savedHours,
    }).toEqual(screen.baseRow);
    expect(
      report.contributors.map((person) => ({
        key: `${person.authorName} · ${person.department ?? ''}`,
        n: person.agents,
        runs: person.runs,
        forks: person.forks,
        h: person.savedHours,
      })),
    ).toEqual(screen.people);
  });

  it('회당 단축 분과 agent 별 절감 시간을 화면 계산식처럼 정수로 반올림한다', () => {
    const input: SkillMetricsInput = {
      deploymentSkills: [],
      userSkills: [userSkill('u1', 'userA', '김정세', 2140, 40, 41)],
      publishedForks: {},
      deploymentUsage: {},
      authorDepartments: {},
    };
    const screen = renderMetrics(toScreenAgents(input));
    const report = computeSkillMetrics(input);

    expect(screen.top[0].hours).toBe(1427);
    expect(report.ranking[0].savedHours).toBe(1427);
  });
});

describe('collectSkillMetrics', () => {
  it('게시된 응용 수와 배포 실행 기록, 작성자 부서를 한 번씩 읽어 집계한다', async () => {
    const input = fixture();
    const listUserSkills = jest.fn().mockResolvedValue(input.userSkills);
    const countPublishedForks = jest.fn().mockResolvedValue(input.publishedForks);
    const getDeploymentSkillUsage = jest.fn().mockResolvedValue(input.deploymentUsage);
    const getSkillAuthorDepartments = jest.fn().mockResolvedValue(input.authorDepartments);

    const report = await collectSkillMetrics({
      listUserSkills,
      listDeploymentSkills: () => input.deploymentSkills,
      countPublishedForks,
      getDeploymentSkillUsage,
      getSkillAuthorDepartments,
    });

    expect(report).toEqual(computeSkillMetrics(input));
    expect(countPublishedForks).toHaveBeenCalledTimes(1);
    expect(countPublishedForks.mock.calls[0][0]).toHaveLength(15);
    expect(getDeploymentSkillUsage).toHaveBeenCalledWith(['b1', 'b2', 'b3', 'd1', 'd2']);
    expect(getSkillAuthorDepartments).toHaveBeenCalledWith(['userA', 'userB', 'userC', 'userD']);
  });
});

describe('createSkillMetricsHandler', () => {
  function response() {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
  }

  const emptyDeps = {
    listUserSkills: async () => [],
    listDeploymentSkills: () => [],
    countPublishedForks: async () => ({}),
    getDeploymentSkillUsage: async () => ({}),
    getSkillAuthorDepartments: async () => ({}),
  };

  it('집계 결과를 200으로 돌려준다', async () => {
    const res = response();
    await createSkillMetricsHandler(emptyDeps)({} as ServerRequest, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ agents: { total: 0 } });
  });

  it('읽기가 실패하면 500을 준다', async () => {
    const res = response();
    await createSkillMetricsHandler({
      ...emptyDeps,
      listUserSkills: async () => {
        throw new Error('db down');
      },
    })({} as ServerRequest, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
