import fs from 'fs';
import os from 'os';
import path from 'path';
import { Types } from 'mongoose';
import type { TSkillCategoriesResponse, TSkillListResponse } from 'librechat-data-provider';
import type { Response } from 'express';
import type { SkillsHandlersDeps } from '../handlers';
import type { ServerRequest } from '~/types';
import {
  createDeploymentSkillMethods,
  getDeploymentSkillRegistry,
  initializeDeploymentSkills,
} from '../deployment';
import { createSkillCategoriesHandler } from '../categories';
import { createSkillsHandlers } from '../handlers';

const DESCRIPTION = 'Use this skill when the market fixture needs a deployment agent.';

let root: string;

async function writeMarketSkill(name: string, category: string, metadata: string[]) {
  const dir = path.join(root, 'skill', name);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(
    path.join(dir, 'SKILL.md'),
    [
      '---',
      `name: ${name}`,
      `description: ${DESCRIPTION}`,
      `category: ${category}`,
      'metadata:',
      ...metadata.map((line) => `  ${line}`),
      '---',
      '',
      `# ${name}`,
    ].join('\n'),
  );
}

function createResponse() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function makeRequest(department?: string) {
  const userId = new Types.ObjectId();
  return {
    user: { id: userId.toString(), _id: userId, role: 'USER', ...(department && { department }) },
    query: {},
    params: {},
  } as unknown as ServerRequest;
}

beforeAll(async () => {
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'market-fields-'));
  await writeMarketSkill('weekly-report', '문서작성', [
    'owner: "박지원"',
    'department: "운영지원팀"',
    'scope: 전 부서',
    'manualMinutes: 26',
    'seedMetrics: { runs: 3120, forks: 41, runSeconds: 40 }',
  ]);
  await writeMarketSkill('edu-center-rollup', '정리·분석', [
    'owner: "정교육"',
    'department: "통일교육팀"',
    'scope: 팀',
  ]);
  await initializeDeploymentSkills({ projectRoot: root, env: {} });
});

afterAll(async () => {
  const emptyRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'market-fields-empty-'));
  await initializeDeploymentSkills({ projectRoot: emptyRoot, env: {} });
  await fs.promises.rm(root, { recursive: true, force: true });
  await fs.promises.rm(emptyRoot, { recursive: true, force: true });
});

function buildDeps(overrides: Partial<SkillsHandlersDeps> = {}) {
  const dbAuthor = new Types.ObjectId();
  const dbSkill = {
    _id: new Types.ObjectId(),
    name: 'my-draft',
    description: 'A persisted skill written by a coworker.',
    category: '문서작성',
    icon: '✍️',
    author: dbAuthor,
    authorName: '홍길동',
    version: 1,
    source: 'inline',
    fileCount: 0,
    alwaysApply: false,
    updatedAt: new Date(0),
  };
  const merged = createDeploymentSkillMethods({
    listSkillsByAccess: jest.fn(async () => ({
      skills: [dbSkill],
      has_more: false,
      after: null,
    })),
  });
  const allIds = [...getDeploymentSkillRegistry().ids(), dbSkill._id];
  const weeklyId = getDeploymentSkillRegistry()
    .list()
    .find((skill) => skill.name === 'weekly-report')!
    ._id.toString();
  const deps = {
    createSkill: jest.fn(),
    getSkillById: jest.fn(),
    listSkillsByAccess: merged.listSkillsByAccess,
    updateSkill: jest.fn(),
    deleteSkill: jest.fn(),
    listSkillFiles: jest.fn(),
    deleteSkillFile: jest.fn(),
    findAccessibleResources: jest.fn(async () => allIds),
    findPubliclyAccessibleResources: jest.fn(async () => []),
    hasPublicPermission: jest.fn(async () => false),
    grantPermission: jest.fn(),
    getSkillFileByPath: jest.fn(),
    updateSkillFileContent: jest.fn(),
    getStrategyFunctions: jest.fn(),
    isValidObjectIdString: jest.fn(() => true),
    countPublishedForks: jest.fn(async () => ({})),
    getDeploymentSkillUsage: jest.fn(async () => ({
      [weeklyId]: { useCount: 10, runTimeTotalSeconds: 600, runTimeSampleCount: 10 },
    })),
    getSkillAuthorDepartments: jest.fn(async () => ({ [dbAuthor.toString()]: '정세분석팀' })),
    ...overrides,
  } as unknown as SkillsHandlersDeps;
  return { deps, dbSkill };
}

async function listFor(department: string | undefined, deps: SkillsHandlersDeps) {
  const res = createResponse();
  await createSkillsHandlers(deps).list(makeRequest(department), res as unknown as Response);
  expect(res.status).toHaveBeenCalledWith(200);
  return (res.json.mock.calls[0][0] as TSkillListResponse).skills;
}

describe('skill list market fields', () => {
  it('adds seed metrics to recorded deployment runs and recomputes the savings', async () => {
    const { deps } = buildDeps();
    const skills = await listFor(undefined, deps);
    const weekly = skills.find((skill) => skill.name === 'weekly-report');

    expect(weekly).toMatchObject({
      authorName: '박지원',
      authorDepartment: '운영지원팀',
      manualMinutes: 26,
      useCount: 3130,
      runTimeTotalSeconds: 3120 * 40 + 600,
      runTimeSampleCount: 3130,
      forkCount: 41,
      marketProfile: { scope: '전 부서' },
    });
    // 평균 125,400초 / 3,130회 = 40.06초, 회당 단축 26 − 0.67 = 25.33분, 3,130회 × 25.33분 = 1,321.5시간
    expect(weekly?.usageMetrics).toEqual({
      averageRunSeconds: 40.1,
      savedMinutesPerRun: 25.3,
      savedHours: 1321.5,
    });
  });

  it('reads the author department and icon of user skills', async () => {
    const { deps } = buildDeps();
    const skills = await listFor(undefined, deps);
    expect(skills.find((skill) => skill.name === 'my-draft')).toMatchObject({
      icon: '✍️',
      authorDepartment: '정세분석팀',
    });
  });

  it('shows team-scoped deployment agents only to their department', async () => {
    const { deps } = buildDeps();
    const names = async (department?: string) =>
      (await listFor(department, deps)).map((skill) => skill.name).sort();

    expect(await names()).toEqual(['my-draft', 'weekly-report']);
    expect(await names('정세분석팀')).toEqual(['my-draft', 'weekly-report']);
    expect(await names('통일교육팀')).toEqual(['edu-center-rollup', 'my-draft', 'weekly-report']);
  });

  it('counts categories with the same department rule as the list', async () => {
    const { deps } = buildDeps();
    const handler = createSkillCategoriesHandler({
      findAccessibleResources: deps.findAccessibleResources,
      findPubliclyAccessibleResources: deps.findPubliclyAccessibleResources,
      listSkillsByAccess: jest.fn(async () => ({ skills: [], has_more: false, after: null })),
    });
    const countFor = async (department?: string) => {
      const res = createResponse();
      await handler(makeRequest(department), res as unknown as Response);
      return (res.json.mock.calls[0][0] as TSkillCategoriesResponse).categories;
    };

    expect(await countFor()).toEqual([{ value: '문서작성', count: 1 }]);
    expect(await countFor('통일교육팀')).toEqual([
      { value: '문서작성', count: 1 },
      { value: '정리·분석', count: 1 },
    ]);
  });
});
