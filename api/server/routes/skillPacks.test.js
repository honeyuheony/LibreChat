const os = require('os');
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  AccessRoleIds,
  PermissionBits,
  PermissionTypes,
  PrincipalType,
  ResourceType,
  SystemRoles,
} = require('librechat-data-provider');

let currentTestUser;
let currentUserOverrides = {};
let rolePermissionsByName;

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return next();
  },
}));

jest.mock('~/server/middleware/config/app', () => (_req, _res, next) => next());

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

  rolePermissionsByName = new Map([
    [SystemRoles.USER, { USE: true, CREATE: true }],
    ['PACKS_NO_USE', { USE: false, CREATE: false }],
    ['PACKS_NO_CREATE', { USE: true, CREATE: false }],
  ]);
  const modelMethods = require('~/models');
  modelMethods.getRoleByName = async (roleName) => ({
    permissions: {
      [PermissionTypes.SKILLS]: rolePermissionsByName.get(roleName) ?? {
        USE: false,
        CREATE: false,
      },
    },
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
    noSkillUse: await User.create({
      name: 'No Skill Use',
      email: 'no-skill-use@test.com',
      role: 'PACKS_NO_USE',
    }),
    noSkillCreate: await User.create({
      name: 'No Skill Create',
      email: 'no-skill-create@test.com',
      role: 'PACKS_NO_CREATE',
    }),
  };

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (currentTestUser) {
      req.user = {
        ...currentTestUser.toObject(),
        ...currentUserOverrides,
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
  currentUserOverrides = {};
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

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function exportPackEntries(packId) {
  const JSZip = require('jszip');
  const response = await request(app)
    .get(`/api/skill-packs/${packId}/export`)
    .buffer(true)
    .parse(binaryParser)
    .expect(200);
  expect(response.headers['content-type']).toBe('application/zip');
  const zip = await JSZip.loadAsync(response.body);
  const entries = {};
  for (const file of Object.values(zip.files).filter((entry) => !entry.dir)) {
    entries[file.name] = await file.async('string');
  }
  return entries;
}

describe('skill pack routes', () => {
  it('requires authentication', async () => {
    currentTestUser = null;

    const response = await request(app).get('/api/skill-packs');

    expect(response.status).toBe(401);
  });

  it('denies listing to a role without skills USE permission', async () => {
    currentTestUser = testUsers.noSkillUse;

    const response = await request(app).get('/api/skill-packs');

    expect(response.status).toBe(403);
  });

  it('denies creation to a role without skills CREATE permission', async () => {
    const first = await createSkill({
      name: 'create-denied-one',
      author: testUsers.owner,
      publicViewer: true,
    });
    const second = await createSkill({
      name: 'create-denied-two',
      author: testUsers.owner,
      publicViewer: true,
    });
    const response = await createPack([first, second], testUsers.noSkillCreate);

    expect(response.status).toBe(403);
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

  it('rejects a pack with more than 50 skill ids', async () => {
    const skills = await Promise.all(
      Array.from({ length: 51 }, (_, index) =>
        createSkill({
          name: `large-pack-skill-${index}`,
          author: testUsers.owner,
          publicViewer: true,
        }),
      ),
    );
    const response = await createPack(skills);

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
    const packId = new mongoose.Types.ObjectId();
    await SkillPack.collection.insertOne({
      _id: packId,
      name: 'Quarterly Pack',
      slug: 'quarterly-pack',
      description: 'Skills for quarterly work.',
      icon: '📦',
      skillIds: [visibleSkill._id, hiddenSkill._id],
      author: testUsers.owner._id,
      authorName: testUsers.owner.name,
      tenantId: 'tenant-private',
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 7,
    });

    currentTestUser = testUsers.reader;
    const response = await request(app).get(`/api/skill-packs/${packId}`).expect(200);

    expect(response.body._id).toBe(packId.toString());
    expect(response.body.skillIds).toEqual([visibleSkill._id.toString()]);
    expect(response.body.skillIds).not.toContain(hiddenSkill._id.toString());
    expect(Object.keys(response.body).sort()).toEqual(
      [
        '_id',
        'author',
        'authorName',
        'createdAt',
        'description',
        'icon',
        'name',
        'skillIds',
        'slug',
        'updatedAt',
      ].sort(),
    );
  });

  it('returns only skills the requester can view when listing packs', async () => {
    const visibleSkill = await createSkill({
      name: 'listed-visible-skill',
      author: testUsers.owner,
      publicViewer: true,
    });
    const hiddenSkill = await createSkill({ name: 'listed-hidden-skill', author: testUsers.owner });
    const packId = new mongoose.Types.ObjectId();
    await SkillPack.collection.insertOne({
      _id: packId,
      name: 'Quarterly Pack',
      slug: 'quarterly-pack',
      description: 'Skills for quarterly work.',
      icon: '📦',
      skillIds: [visibleSkill._id, hiddenSkill._id],
      author: testUsers.owner._id,
      authorName: testUsers.owner.name,
      tenantId: 'tenant-private',
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 7,
    });

    currentTestUser = testUsers.reader;
    const response = await request(app).get('/api/skill-packs').expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].skillIds).toEqual([visibleSkill._id.toString()]);
    expect(response.body[0].skillIds).not.toContain(hiddenSkill._id.toString());
  });

  it('uses username or email prefix when the author name is blank', async () => {
    const first = await createSkill({
      name: 'fallback-name-one',
      author: testUsers.owner,
      publicViewer: true,
    });
    const second = await createSkill({
      name: 'fallback-name-two',
      author: testUsers.owner,
      publicViewer: true,
    });

    currentUserOverrides = { name: '', username: 'pack-owner-alias' };
    const usernameResponse = await createPack([first, second]);
    expect(usernameResponse.status).toBe(201);
    expect(usernameResponse.body.authorName).toBe('pack-owner-alias');

    currentUserOverrides = { name: '', username: '', email: 'pack-fallback@test.com' };
    const emailResponse = await createPack([first, second]);
    expect(emailResponse.status).toBe(201);
    expect(emailResponse.body.authorName).toBe('pack-fallback');
  });

  it('exports a pack as a plugin zip holding only the skills the requester can view', async () => {
    const first = await createSkill({
      name: 'pack-first-skill',
      author: testUsers.owner,
      publicViewer: true,
    });
    const second = await createSkill({
      name: 'pack-second-skill',
      author: testUsers.owner,
      publicViewer: true,
    });
    const created = await createPack([first, second]);
    expect(created.status).toBe(201);
    await AclEntry.deleteMany({ resourceId: second._id, principalType: PrincipalType.PUBLIC });

    currentTestUser = testUsers.reader;
    const entries = await exportPackEntries(created.body._id);

    expect(Object.keys(entries)).toEqual([
      '.claude-plugin/plugin.json',
      'skills/pack-first-skill/SKILL.md',
      'README.md',
    ]);
    expect(entries['skills/pack-first-skill/SKILL.md']).toBe(
      [
        '---',
        'name: pack-first-skill',
        'description: pack-first-skill skill description for pack tests.',
        '---',
        '',
        '# Skill',
      ].join('\n'),
    );
    expect(JSON.parse(entries['.claude-plugin/plugin.json'])).toEqual({
      name: created.body.slug,
      version: '0.1.0',
      description: 'Skills for quarterly work.',
      author: { name: 'Pack Owner' },
    });
  });

  it('returns 404 when exporting a pack that does not exist', async () => {
    currentTestUser = testUsers.reader;
    const missing = await request(app).get(
      `/api/skill-packs/${new mongoose.Types.ObjectId()}/export`,
    );
    const malformed = await request(app).get('/api/skill-packs/not-an-id/export');

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
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
    expect(listing.body[0].skillIds).toEqual([first._id.toString(), second._id.toString()]);

    currentTestUser = testUsers.other;
    await request(app).delete(`/api/skill-packs/${created.body._id}`).expect(403);
    expect(await SkillPack.findById(created.body._id)).not.toBeNull();

    currentTestUser = testUsers.owner;
    await request(app).delete(`/api/skill-packs/${created.body._id}`).expect(200);
    expect(await SkillPack.findById(created.body._id)).toBeNull();
  });
});

describe('skill pack routes with a public ACL entry on a team deployment skill', () => {
  let root;
  let teamDeploymentId;

  beforeAll(async () => {
    const { initializeDeploymentSkills, getDeploymentSkillRegistry } = require('@librechat/api');
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'skill-packs-deployment-'));
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
        '# center-rollup',
      ].join('\n'),
    );
    await fs.promises.mkdir(path.join(skillDir, 'references'));
    await fs.promises.writeFile(path.join(skillDir, 'references', 'rules.md'), '# 집계 규칙');
    await initializeDeploymentSkills({ projectRoot: root, env: {} });
    teamDeploymentId = getDeploymentSkillRegistry().list()[0]._id;
  });

  afterAll(async () => {
    const { initializeDeploymentSkills } = require('@librechat/api');
    await initializeDeploymentSkills({ projectRoot: path.join(root, 'empty'), env: {} });
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await grantPermission({
      principalType: PrincipalType.PUBLIC,
      principalId: null,
      resourceType: ResourceType.SKILL,
      resourceId: teamDeploymentId,
      accessRoleId: AccessRoleIds.SKILL_VIEWER,
      grantedBy: testUsers.owner._id,
    });
  });

  async function insertPackWithTeamSkill() {
    const publicSkill = await createSkill({
      name: 'pack-public-skill',
      author: testUsers.owner,
      publicViewer: true,
    });
    const packId = new mongoose.Types.ObjectId();
    await SkillPack.collection.insertOne({
      _id: packId,
      name: 'Center Pack',
      slug: 'center-pack',
      description: 'Skills for the center.',
      skillIds: [publicSkill._id, teamDeploymentId],
      author: testUsers.owner._id,
      authorName: testUsers.owner.name,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { packId, publicSkill };
  }

  it('rejects a pack that contains the team deployment skill', async () => {
    const publicSkill = await createSkill({
      name: 'pack-public-skill',
      author: testUsers.owner,
      publicViewer: true,
    });
    const response = await createPack([publicSkill, { _id: teamDeploymentId }]);

    expect(response.status).toBe(400);
    expect(await SkillPack.countDocuments({})).toBe(0);
  });

  it('hides the team deployment skill from another department when listing packs', async () => {
    const { publicSkill } = await insertPackWithTeamSkill();
    currentTestUser = testUsers.reader;
    currentUserOverrides = { department: '통일교육팀' };

    const response = await request(app).get('/api/skill-packs').expect(200);

    expect(response.body[0].skillIds).toEqual([publicSkill._id.toString()]);
  });

  it('hides the team deployment skill from another department when reading a pack', async () => {
    const { packId, publicSkill } = await insertPackWithTeamSkill();
    currentTestUser = testUsers.reader;
    currentUserOverrides = { department: '통일교육팀' };

    const response = await request(app).get(`/api/skill-packs/${packId}`).expect(200);

    expect(response.body.skillIds).toEqual([publicSkill._id.toString()]);
  });

  it('shows the team deployment skill to the authoring department', async () => {
    const { packId, publicSkill } = await insertPackWithTeamSkill();
    currentTestUser = testUsers.reader;
    currentUserOverrides = { department: '교육센터' };

    const response = await request(app).get(`/api/skill-packs/${packId}`).expect(200);

    expect(response.body.skillIds).toEqual([
      publicSkill._id.toString(),
      teamDeploymentId.toString(),
    ]);
  });

  it('leaves the team deployment skill out of the pack zip for another department', async () => {
    const { packId } = await insertPackWithTeamSkill();
    currentTestUser = testUsers.reader;
    currentUserOverrides = { department: '통일교육팀' };

    const entries = await exportPackEntries(packId);

    expect(Object.keys(entries)).toEqual([
      '.claude-plugin/plugin.json',
      'skills/pack-public-skill/SKILL.md',
      'README.md',
    ]);
  });

  it('puts the team deployment skill and its files in the zip for the authoring department', async () => {
    const { packId } = await insertPackWithTeamSkill();
    currentTestUser = testUsers.reader;
    currentUserOverrides = { department: '교육센터' };

    const entries = await exportPackEntries(packId);

    expect(Object.keys(entries)).toEqual([
      '.claude-plugin/plugin.json',
      'skills/pack-public-skill/SKILL.md',
      'skills/center-rollup/SKILL.md',
      'skills/center-rollup/references/rules.md',
      'README.md',
    ]);
    expect(entries['skills/center-rollup/references/rules.md']).toBe('# 집계 규칙');
    expect(entries['skills/center-rollup/SKILL.md']).toContain('name: center-rollup\n');
    expect(entries['skills/center-rollup/SKILL.md']).toContain('# center-rollup');
  });
});
