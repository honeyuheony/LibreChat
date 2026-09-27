const os = require('os');
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  SystemRoles,
  ResourceType,
  AccessRoleIds,
  PermissionBits,
  PrincipalType,
} = require('librechat-data-provider');

jest.mock('~/models', () => {
  const mongoose = require('mongoose');
  const { createMethods } = require('@librechat/data-schemas');
  return { ...createMethods(mongoose), getRoleByName: jest.fn() };
});

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (_req, _res, next) => next(),
  configMiddleware: (_req, _res, next) => next(),
  messageIpLimiter: (_req, _res, next) => next(),
}));

jest.mock('~/server/services/Schedules', () => ({
  getLimits: jest.fn(async () => ({
    enabled: true,
    maxPerUser: 10,
    minIntervalMinutes: 60,
    autoDisableAfterFailures: 5,
    admissionConcurrency: 20,
    fireConcurrency: 5,
    mcpPreflightConcurrency: 3,
    mcpPreflightTimeoutMs: 300_000,
    requireProject: false,
  })),
  fireScheduleNow: jest.fn(async () => null),
  deleteScheduleForOwner: jest.fn(async () => 'deleted'),
  isUserDeleting: jest.fn(async () => false),
}));

jest.mock('~/server/services/Schedules/access', () => ({
  resolveAgentFireAccess: jest.fn(async () => 'ok'),
}));

jest.mock('~/server/services/Schedules/mcp', () => jest.fn(async () => []));

let app;
let mongoServer;
let owner;
let stranger;
let ownerDepartment;

const scheduleBody = (overrides = {}) => ({
  name: '주간보고 hwp 작성',
  prompt: 'hwp로 보고서 작성을 실행해 주세요.',
  agent_id: 'agent_default',
  cadence: { frequency: 'weekly', daysOfWeek: [1], hour: 9, minute: 0 },
  timezone: 'Asia/Seoul',
  clientRequestId: `req-${Math.random().toString(36).slice(2)}`,
  ...overrides,
});

async function createSkill(name, author) {
  const { Skill } = require('~/db/models');
  return Skill.create({
    name,
    description: 'A skill used by the schedule route tests.',
    body: '# Skill',
    author: author._id,
    authorName: author.name,
  });
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const { User, AccessRole } = require('~/db/models');
  await AccessRole.create({
    accessRoleId: AccessRoleIds.SKILL_VIEWER,
    name: 'Viewer',
    resourceType: ResourceType.SKILL,
    permBits: PermissionBits.VIEW,
  });
  owner = await User.create({ name: 'Owner', email: 'owner@test.com', role: SystemRoles.USER });
  stranger = await User.create({
    name: 'Stranger',
    email: 'stranger@test.com',
    role: SystemRoles.USER,
  });

  const { getRoleByName } = require('~/models');
  getRoleByName.mockImplementation(async () => ({
    permissions: { SCHEDULES: { USE: true, CREATE: true } },
  }));

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: owner._id.toString(),
      _id: owner._id,
      role: owner.role,
      department: ownerDepartment,
    };
    next();
  });
  app.use('/api/schedules', require('./schedules'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('schedule skills', () => {
  it('accepts a skill the requesting user can view', async () => {
    const skill = await createSkill('hwp-report', stranger);
    const { grantPermission } = require('~/server/services/PermissionService');
    await grantPermission({
      principalType: PrincipalType.USER,
      principalId: owner._id,
      resourceType: ResourceType.SKILL,
      resourceId: skill._id,
      accessRoleId: AccessRoleIds.SKILL_VIEWER,
      grantedBy: stranger._id,
    });

    const res = await request(app)
      .post('/api/schedules')
      .send(scheduleBody({ skills: ['hwp-report'] }));

    expect(res.status).toBe(201);
    expect(res.body.skills).toEqual(['hwp-report']);
  });

  it('refuses a skill the requesting user cannot view', async () => {
    await createSkill('private-report', stranger);

    const res = await request(app)
      .post('/api/schedules')
      .send(scheduleBody({ skills: ['private-report'] }));

    expect(res.status).toBe(400);
  });
});

describe('schedule deployment skills', () => {
  const { initializeDeploymentSkills } = require('@librechat/api');
  let root;

  beforeAll(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'schedule-deployment-skills-'));
    const skillDir = path.join(root, 'skill', 'center-rollup');
    await fs.promises.mkdir(skillDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: center-rollup',
        'description: Rolls up the education center weekly figures for the team.',
        'metadata:',
        '  department: "교육센터"',
        '  scope: 팀',
        '---',
        '',
        '# Center rollup',
      ].join('\n'),
    );
    await initializeDeploymentSkills({ projectRoot: root, env: {} });
  });

  afterAll(async () => {
    ownerDepartment = undefined;
    await initializeDeploymentSkills({ projectRoot: path.join(root, 'empty'), env: {} });
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('refuses a team deployment skill for an owner in another department', async () => {
    ownerDepartment = '통일교육팀';

    const res = await request(app)
      .post('/api/schedules')
      .send(scheduleBody({ skills: ['center-rollup'] }));

    expect(res.status).toBe(400);
  });

  it('accepts a team deployment skill for an owner in the authoring department', async () => {
    ownerDepartment = '교육센터';

    const res = await request(app)
      .post('/api/schedules')
      .send(scheduleBody({ skills: ['center-rollup'] }));

    expect(res.status).toBe(201);
    expect(res.body.skills).toEqual(['center-rollup']);
  });
});
