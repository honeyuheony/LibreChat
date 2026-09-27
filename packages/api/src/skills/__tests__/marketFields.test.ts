import fs from 'fs';
import os from 'os';
import path from 'path';
import { Types } from 'mongoose';
import type {
  CreateSkillInput,
  CreateSkillResult,
  ISkill,
  UpdateSkillInput,
  UpdateSkillResult,
} from '@librechat/data-schemas';
import type {
  FiltersConfig,
  TSkill,
  TSkillCategoriesResponse,
  TSkillListResponse,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { SkillsHandlersDeps } from '../handlers';
import type { ServerRequest } from '~/types';
import {
  createDeploymentSkillMethods,
  getDeploymentSkillRegistry,
  initializeDeploymentSkills,
} from '../deployment';
import { createSkillsHandlers, serializeSkill } from '../handlers';
import { createSkillCategoriesHandler } from '../categories';

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

function makeSkillRecord(overrides: Partial<ISkill> = {}): ISkill & { _id: Types.ObjectId } {
  return {
    _id: new Types.ObjectId(),
    name: 'builder-skill',
    description: 'A persisted skill used for builder handler tests.',
    body: '# Builder skill',
    frontmatter: { examples: ['Compare these reports.'] },
    category: '정리·분석',
    author: new Types.ObjectId(),
    authorName: '홍길동',
    version: 1,
    source: 'inline',
    fileCount: 0,
    alwaysApply: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function buildDeps(overrides: Partial<SkillsHandlersDeps> = {}) {
  const dbAuthor = new Types.ObjectId();
  const dbSkill = {
    _id: new Types.ObjectId(),
    name: 'my-draft',
    description: 'A persisted skill written by a coworker.',
    frontmatter: {
      examples: [
        'Compare report 1.',
        'Compare report 2.',
        'Compare report 3.',
        'Compare report 4.',
        'Compare report 5.',
        'Compare report 6.',
      ],
    },
    builder: {
      text: 'Stored editor state.',
      direct: false,
      sources: { title: 'ai' },
      aiOff: [],
    },
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
    // 평균 125,400초 / 3,130회 = 40.06초. 회당 26 − 0.67분을 25분으로, 누적 3,130 × 25 / 60시간을 1,304시간으로 반올림한다.
    expect(weekly?.usageMetrics).toEqual({
      averageRunSeconds: 40.1,
      savedMinutesPerRun: 25,
      savedHours: 1304,
    });
  });

  it('limits serialized frontmatter examples and omits builder state from list rows', async () => {
    const { deps } = buildDeps();
    const skills = await listFor(undefined, deps);
    const draft = skills.find((skill) => skill.name === 'my-draft');

    expect(draft?.examples).toEqual([
      'Compare report 1.',
      'Compare report 2.',
      'Compare report 3.',
      'Compare report 4.',
      'Compare report 5.',
    ]);
    expect(draft).not.toHaveProperty('builder');
    expect(draft?.publishedAt).toBeUndefined();
  });

  it('distinguishes a missing publication timestamp from an explicit draft', () => {
    const missing = serializeSkill(makeSkillRecord(), false);
    const draft = serializeSkill(makeSkillRecord({ publishedAt: null }), false);

    expect(missing.publishedAt).toBeUndefined();
    expect(draft.publishedAt).toBeNull();
  });

  it('limits detail examples stored in frontmatter to five', () => {
    const examples = ['one', 'two', 'three', 'four', 'five', 'six'];
    const skill = serializeSkill(makeSkillRecord({ frontmatter: { examples } }), false);

    expect(skill.examples).toEqual(examples.slice(0, 5));
  });

  it.each([
    [
      'valid publication and test records',
      {
        publishedAt: '2026-09-27T10:00:00.000Z',
        lastTest: {
          version: 1,
          seconds: 24,
          conversationId: 'conversation-1',
          at: '2026-09-27T09:59:00.000Z',
        },
      },
    ],
    ['invalid publication date', { publishedAt: 'not-a-date' }],
    ['boolean publication date', { publishedAt: true }],
    [
      'missing test timestamp',
      { lastTest: { version: 1, seconds: 24, conversationId: 'conversation-1' } },
    ],
    [
      'invalid test timestamp',
      { lastTest: { version: 1, seconds: 24, conversationId: 'conversation-1', at: 'abc' } },
    ],
    ['boolean test result', { lastTest: true }],
  ])('ignores %s on create without returning a server error', async (_name, untrustedFields) => {
    const builder = {
      text: 'Compare the reports.',
      direct: false,
      sources: { title: 'ai' },
      aiOff: [],
    };
    const createSkill = jest.fn(
      async (input: CreateSkillInput): Promise<CreateSkillResult> => ({
        skill: makeSkillRecord({
          builder: input.builder,
          publishedAt: input.publishedAt,
          lastTest: input.lastTest,
        }),
        warnings: [],
      }),
    );
    const { deps } = buildDeps({ createSkill });
    const response = createResponse();
    const handlers = createSkillsHandlers(deps);
    const req = Object.assign(makeRequest(), {
      body: {
        name: 'builder-skill',
        description: 'A builder skill for creating a draft.',
        body: 'Instructions',
        builder,
        ...untrustedFields,
      },
    });

    await handlers.create(req, response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(201);
    expect(createSkill).toHaveBeenCalledWith(expect.objectContaining({ builder }));
    expect(createSkill.mock.calls[0][0].publishedAt).toBeUndefined();
    expect(createSkill.mock.calls[0][0].lastTest).toBeUndefined();
    const skill = response.json.mock.calls[0][0] as TSkill;
    expect(skill.publishedAt).toBeUndefined();
    expect(skill.lastTest).toBeUndefined();
  });

  it.each([
    [
      'valid publication and test records',
      {
        publishedAt: '2026-09-27T10:00:00.000Z',
        lastTest: {
          version: 1,
          seconds: 24,
          conversationId: 'conversation-1',
          at: '2026-09-27T09:59:00.000Z',
        },
      },
    ],
    ['invalid publication date', { publishedAt: 'not-a-date' }],
    ['boolean publication date', { publishedAt: true }],
    [
      'missing test timestamp',
      { lastTest: { version: 1, seconds: 24, conversationId: 'conversation-1' } },
    ],
    [
      'invalid test timestamp',
      { lastTest: { version: 1, seconds: 24, conversationId: 'conversation-1', at: 'abc' } },
    ],
    ['boolean test result', { lastTest: true }],
  ])('ignores %s on patch without returning a server error', async (_name, untrustedFields) => {
    const builder = {
      text: 'Compare the reports.',
      direct: true,
      sources: { title: 'me' },
      aiOff: [],
    };
    const updateSkill = jest.fn(
      async (input: {
        id: string;
        expectedVersion: number;
        update: UpdateSkillInput;
      }): Promise<UpdateSkillResult> => ({
        status: 'updated',
        skill: makeSkillRecord({
          builder: input.update.builder,
          publishedAt: input.update.publishedAt,
          lastTest: input.update.lastTest,
        }),
        warnings: [],
      }),
    );
    const { deps } = buildDeps({ updateSkill });
    const response = createResponse();
    const handlers = createSkillsHandlers(deps);
    const req = Object.assign(makeRequest(), {
      params: { id: new Types.ObjectId().toString() },
      body: { expectedVersion: 1, builder, ...untrustedFields },
    });

    await handlers.patch(req, response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(updateSkill).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ builder }) }),
    );
    expect(updateSkill.mock.calls[0][0].update.publishedAt).toBeUndefined();
    expect(updateSkill.mock.calls[0][0].update.lastTest).toBeUndefined();
    const skill = response.json.mock.calls[0][0] as TSkill;
    expect(skill.publishedAt).toBeUndefined();
    expect(skill.lastTest).toBeUndefined();
  });

  const invalidBuilderStates = [
    ['not an object', null],
    ['missing required fields', { text: 'text' }],
    ['non-string text', { text: 1, direct: true, sources: {}, aiOff: [] }],
    ['non-boolean direct', { text: 'text', direct: 'yes', sources: {}, aiOff: [] }],
    ['non-string textBy', { text: 'text', direct: true, textBy: 1, sources: {}, aiOff: [] }],
    ['sources is not an object', { text: 'text', direct: true, sources: [], aiOff: [] }],
    [
      'sources is not a plain object',
      { text: 'text', direct: true, sources: new Map(), aiOff: [] },
    ],
    [
      'source value is not a string',
      { text: 'text', direct: true, sources: { title: false }, aiOff: [] },
    ],
    ['aiOff is not an array', { text: 'text', direct: true, sources: {}, aiOff: 'step' }],
    ['aiOff item is not a string', { text: 'text', direct: true, sources: {}, aiOff: [1] }],
  ] as const;

  it.each(invalidBuilderStates)(
    'rejects an invalid builder state in create and patch (%s)',
    async (_name, builder) => {
      const createSkill = jest.fn(
        async (_input: CreateSkillInput): Promise<CreateSkillResult> => ({
          skill: makeSkillRecord(),
          warnings: [],
        }),
      );
      const updateSkill = jest.fn(
        async (_input: {
          id: string;
          expectedVersion: number;
          update: UpdateSkillInput;
        }): Promise<UpdateSkillResult> => ({
          status: 'updated',
          skill: makeSkillRecord(),
          warnings: [],
        }),
      );
      const { deps } = buildDeps({ createSkill, updateSkill });
      const handlers = createSkillsHandlers(deps);
      const createResponseMock = createResponse();
      const createRequest = Object.assign(makeRequest(), {
        body: {
          name: 'builder-skill',
          description: 'A builder skill for creating a draft.',
          builder,
        },
      });
      await handlers.create(createRequest, createResponseMock as unknown as Response);

      const patchResponseMock = createResponse();
      const patchRequest = Object.assign(makeRequest(), {
        params: { id: new Types.ObjectId().toString() },
        body: { expectedVersion: 1, builder },
      });
      await handlers.patch(patchRequest, patchResponseMock as unknown as Response);

      expect(createResponseMock.status).toHaveBeenCalledWith(400);
      expect(createResponseMock.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
          issues: expect.arrayContaining([
            expect.objectContaining({ field: expect.stringMatching(/^builder/) }),
          ]),
        }),
      );
      expect(patchResponseMock.status).toHaveBeenCalledWith(400);
      expect(patchResponseMock.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
          issues: expect.arrayContaining([
            expect.objectContaining({ field: expect.stringMatching(/^builder/) }),
          ]),
        }),
      );
      expect(createSkill).not.toHaveBeenCalled();
      expect(updateSkill).not.toHaveBeenCalled();
    },
  );

  it('checks builder text with the skill content filter before create and patch', async () => {
    const builder = {
      text: 'PRIVATE-TEXT',
      direct: false,
      sources: { title: 'ai' },
      aiOff: [],
    };
    const filters: FiltersConfig = {
      skills: {
        pii: {
          fields: ['instructions'],
          starterPatterns: [],
          customPatterns: [{ id: 'private', label: 'private text', regex: 'PRIVATE-TEXT' }],
        },
      },
    };
    const createSkill = jest.fn(
      async (_input: CreateSkillInput): Promise<CreateSkillResult> => ({
        skill: makeSkillRecord({ builder }),
        warnings: [],
      }),
    );
    const updateSkill = jest.fn(
      async (_input: {
        id: string;
        expectedVersion: number;
        update: UpdateSkillInput;
      }): Promise<UpdateSkillResult> => ({
        status: 'updated',
        skill: makeSkillRecord({ builder }),
        warnings: [],
      }),
    );
    const { deps } = buildDeps({ createSkill, updateSkill });
    const handlers = createSkillsHandlers(deps);
    const createResponseMock = createResponse();
    const createRequest = Object.assign(makeRequest(), {
      config: { filters } as ServerRequest['config'],
      body: {
        name: 'builder-skill',
        description: 'A builder skill for creating a draft.',
        body: 'Clean body',
        builder,
      },
    });
    await handlers.create(createRequest, createResponseMock as unknown as Response);

    const patchResponseMock = createResponse();
    const patchRequest = Object.assign(makeRequest(), {
      config: { filters } as ServerRequest['config'],
      params: { id: new Types.ObjectId().toString() },
      body: { expectedVersion: 1, builder },
    });
    await handlers.patch(patchRequest, patchResponseMock as unknown as Response);

    expect(createResponseMock.status).toHaveBeenCalledWith(400);
    expect(patchResponseMock.status).toHaveBeenCalledWith(400);
    expect(createSkill).not.toHaveBeenCalled();
    expect(updateSkill).not.toHaveBeenCalled();
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
