const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  AccessRoleIds,
  PermissionBits,
  PrincipalType,
  ResourceType,
  SystemRoles,
} = require('librechat-data-provider');

let currentTestUser;

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return next();
  },
}));

jest.mock('~/server/middleware/config/app', () => (_req, _res, next) => next());

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock('~/server/services/Skills/sync', () => ({
  getGitHubSkillSyncRunnerForRequest: jest.fn(),
}));

let app;
let mongoServer;
let Skill;
let User;
let grantPermission;
let testUsers;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const dbModels = require('~/db/models');
  Skill = dbModels.Skill;
  User = dbModels.User;

  await dbModels.AccessRole.create({
    accessRoleId: AccessRoleIds.SKILL_VIEWER,
    name: 'Viewer',
    resourceType: ResourceType.SKILL,
    permBits: PermissionBits.VIEW,
  });
  await dbModels.AccessRole.create({
    accessRoleId: AccessRoleIds.SKILL_OWNER,
    name: 'Owner',
    resourceType: ResourceType.SKILL,
    permBits:
      PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
  });
  await require('~/models').seedSystemGrants();

  grantPermission = require('~/server/services/PermissionService').grantPermission;

  testUsers = {
    admin: await User.create({ name: '관리자', email: 'admin@test.com', role: SystemRoles.ADMIN }),
    author: await User.create({ name: '김정세', email: 'author@test.com', role: SystemRoles.USER }),
  };
  await User.collection.updateOne(
    { _id: testUsers.author._id },
    { $set: { department: '정세분석팀' } },
  );

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (currentTestUser) {
      req.user = {
        ...currentTestUser.toObject(),
        id: currentTestUser._id.toString(),
        _id: currentTestUser._id,
      };
    }
    next();
  });
  app.use('/api/admin/skills', require('./skills'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

async function createSkill({ name, useCount, forkOf, publicViewer = false }) {
  const skill = await Skill.create({
    name,
    description: `${name} skill description for metrics tests.`,
    body: '# Skill',
    frontmatter: {},
    author: testUsers.author._id,
    authorName: testUsers.author.name,
    version: 1,
    source: 'inline',
    fileCount: 0,
    alwaysApply: false,
    useCount,
    runTimeTotalSeconds: useCount * 60,
    runTimeSampleCount: useCount,
    manualMinutes: 31,
    ...(forkOf && { forkOf }),
  });
  await grantPermission({
    principalType: PrincipalType.USER,
    principalId: testUsers.author._id,
    resourceType: ResourceType.SKILL,
    resourceId: skill._id,
    accessRoleId: AccessRoleIds.SKILL_OWNER,
    grantedBy: testUsers.author._id,
  });
  if (publicViewer) {
    await grantPermission({
      principalType: PrincipalType.PUBLIC,
      principalId: null,
      resourceType: ResourceType.SKILL,
      resourceId: skill._id,
      accessRoleId: AccessRoleIds.SKILL_VIEWER,
      grantedBy: testUsers.author._id,
    });
  }
  return skill;
}

describe('GET /api/admin/skills/metrics (skill metrics)', () => {
  let original;

  beforeAll(async () => {
    original = await createSkill({ name: 'weekly-brief', useCount: 120, publicViewer: true });
    await createSkill({ name: 'private-note', useCount: 30 });
    await createSkill({
      name: 'weekly-brief-team',
      useCount: 12,
      forkOf: original._id,
      publicViewer: true,
    });
    await createSkill({ name: 'weekly-brief-draft', useCount: 0, forkOf: original._id });
  });

  it('관리자가 아니면 403을 준다', async () => {
    currentTestUser = testUsers.author;

    const res = await request(app).get('/api/admin/skills/metrics');

    expect(res.status).toBe(403);
    expect(res.body.agents).toBeUndefined();
  });

  it('관리자에게 「나만」 공개 스킬까지 센 지표를 준다', async () => {
    currentTestUser = testUsers.admin;

    const res = await request(app).get('/api/admin/skills/metrics');

    expect(res.status).toBe(200);
    expect(res.body.agents).toEqual({ total: 4, base: 0, staff: 4 });
    expect(res.body.runs).toEqual({ total: 162, staff: 162 });
    expect(res.body.forks).toEqual({ total: 1, forkedAgents: 2 });
    expect(res.body.savedHours).toEqual({ total: 81, staff: 81 });
    expect(res.body.baseTotal).toEqual({ count: 0, runs: 0, forks: 0, savedHours: 0 });
    expect(res.body.ranking.map((agent) => agent.name)).toEqual([
      'weekly-brief',
      'private-note',
      'weekly-brief-team',
      'weekly-brief-draft',
    ]);
    expect(res.body.ranking[0]).toEqual({
      id: original._id.toString(),
      name: 'weekly-brief',
      authorName: '김정세',
      authorDepartment: '정세분석팀',
      runs: 120,
      forks: 1,
      savedHours: 60,
    });
    expect(res.body.contributors).toEqual([
      {
        authorName: '김정세',
        department: '정세분석팀',
        agents: 4,
        runs: 162,
        forks: 1,
        savedHours: 81,
      },
    ]);
  });
});
