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

let app;
let mongoServer;
let User;
let Skill;
let SkillPack;
let AccessRole;
let AclEntry;
let testUsers;
let grantPermission;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const dbModels = require('~/db/models');
  User = dbModels.User;
  Skill = dbModels.Skill;
  SkillPack = dbModels.SkillPack;
  AccessRole = dbModels.AccessRole;
  AclEntry = dbModels.AclEntry;

  await AccessRole.create({
    accessRoleId: AccessRoleIds.SKILL_VIEWER,
    name: 'Viewer',
    resourceType: ResourceType.SKILL,
    permBits: PermissionBits.VIEW,
  });
  await AccessRole.create({
    accessRoleId: AccessRoleIds.SKILL_OWNER,
    name: 'Owner',
    resourceType: ResourceType.SKILL,
    permBits:
      PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
  });

  const permissionService = require('~/server/services/PermissionService');
  grantPermission = permissionService.grantPermission;

  testUsers = {
    owner: await User.create({
      name: 'Pack Owner',
      email: 'pack-owner@test.com',
      role: SystemRoles.USER,
    }),
    reader: await User.create({
      name: 'Pack Reader',
      email: 'pack-reader@test.com',
      role: SystemRoles.USER,
    }),
    other: await User.create({
      name: 'Other User',
      email: 'other-user@test.com',
      role: SystemRoles.USER,
    }),
  };

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
  app.use('/api/skill-packs', require('./skillPacks'));
});

afterEach(async () => {
  await SkillPack.deleteMany({});
  await AclEntry.deleteMany({});
  await Skill.deleteMany({});
  currentTestUser = testUsers.reader;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  jest.clearAllMocks();
});

async function createSkill({ name, author, publicViewer = false }) {
  const skill = await Skill.create({
    name,
    description: `${name} skill description for pack tests.`,
    body: '# Skill',
    frontmatter: {},
    author: author._id,
    authorName: author.name,
    version: 1,
    source: 'inline',
    fileCount: 0,
    alwaysApply: false,
  });

  await grantPermission({
    principalType: publicViewer ? PrincipalType.PUBLIC : PrincipalType.USER,
    principalId: publicViewer ? null : author._id,
    resourceType: ResourceType.SKILL,
    resourceId: skill._id,
    accessRoleId: publicViewer ? AccessRoleIds.SKILL_VIEWER : AccessRoleIds.SKILL_OWNER,
    grantedBy: author._id,
  });

  return skill;
}

async function createPack(skillIds, author = testUsers.owner) {
  currentTestUser = author;
  const response = await request(app)
    .post('/api/skill-packs')
    .send({
      name: 'Quarterly Pack',
      description: 'Skills for quarterly work.',
      icon: '📦',
      skillIds: skillIds.map((skill) => skill._id.toString()),
    });
  return response;
}

describe('skill pack routes', () => {
  it('requires authentication', async () => {
    currentTestUser = null;

    const response = await request(app).get('/api/skill-packs');

    expect(response.status).toBe(401);
  });

  it('rejects a pack with fewer than two skill ids', async () => {
    const skill = await createSkill({
      name: 'single-skill',
      author: testUsers.owner,
      publicViewer: true,
    });
    const response = await createPack([skill]);

    expect(response.status).toBe(400);
  });

  it('rejects a pack containing a skill without public view access', async () => {
    const publicSkill = await createSkill({
      name: 'public-skill',
      author: testUsers.owner,
      publicViewer: true,
    });
    const privateSkill = await createSkill({ name: 'private-skill', author: testUsers.owner });
    const response = await createPack([publicSkill, privateSkill]);

    expect(response.status).toBe(400);
  });

  it('returns only skills the requester can view when reading a pack', async () => {
    const visibleSkill = await createSkill({
      name: 'visible-skill',
      author: testUsers.owner,
      publicViewer: true,
    });
    const hiddenSkill = await createSkill({
      name: 'hidden-skill',
      author: testUsers.owner,
    });
    const created = await SkillPack.create({
      name: 'Quarterly Pack',
      slug: 'quarterly-pack',
      description: 'Skills for quarterly work.',
      icon: '📦',
      skillIds: [visibleSkill._id, hiddenSkill._id],
      author: testUsers.owner._id,
      authorName: testUsers.owner.name,
    });

    currentTestUser = testUsers.reader;
    const response = await request(app).get(`/api/skill-packs/${created._id}`).expect(200);

    expect(response.body.skillIds).toEqual([visibleSkill._id.toString()]);
    expect(response.body.skillIds).not.toContain(hiddenSkill._id.toString());
  });

  it('prevents users other than the author from deleting a pack', async () => {
    const first = await createSkill({
      name: 'delete-skill-one',
      author: testUsers.owner,
      publicViewer: true,
    });
    const second = await createSkill({
      name: 'delete-skill-two',
      author: testUsers.owner,
      publicViewer: true,
    });
    const created = await createPack([first, second]);
    expect(created.status).toBe(201);

    currentTestUser = testUsers.owner;
    const listing = await request(app).get('/api/skill-packs').expect(200);
    expect(listing.body[0]).not.toHaveProperty('skillIds');

    currentTestUser = testUsers.other;
    await request(app).delete(`/api/skill-packs/${created.body._id}`).expect(403);
    expect(await SkillPack.findById(created.body._id)).not.toBeNull();

    currentTestUser = testUsers.owner;
    await request(app).delete(`/api/skill-packs/${created.body._id}`).expect(200);
    expect(await SkillPack.findById(created.body._id)).toBeNull();
  });
});
