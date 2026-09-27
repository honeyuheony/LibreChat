const express = require('express');
const request = require('supertest');
const JSZip = require('jszip');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

/** 요청 수 제한 테스트가 적은 횟수로 한도에 닿도록, 경로 모듈을 불러오기 전에 정한다. */
const DRAFT_USER_MAX_FOR_TEST = 5;
process.env.DRAFT_USER_MAX = String(DRAFT_USER_MAX_FOR_TEST);

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    mergeFileConfig: jest.fn((dynamic) => {
      const skillFileSizeLimit = dynamic?.skills?.fileSizeLimit;
      return {
        ...actual.fileConfig,
        ...dynamic,
        skills: {
          ...(actual.fileConfig.skills ?? { fileSizeLimit: 50 * 1024 * 1024 }),
          ...(skillFileSizeLimit !== undefined
            ? { fileSizeLimit: skillFileSizeLimit * 1024 * 1024 }
            : {}),
        },
      };
    }),
  };
});

const {
  SystemRoles,
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
} = require('librechat-data-provider');
const { CONTENT_TRAVERSAL_MAX_DEPTH } = require('@librechat/api');

let mockFileConfig;
let mockFilters;
const mockMaybeRunGitHubSkillSyncForRequest = jest.fn(async () => false);

jest.mock('~/server/services/Config', () => ({
  getCachedTools: jest.fn().mockResolvedValue({}),
  getAppConfig: jest.fn().mockResolvedValue({
    fileStrategy: 'local',
    paths: { uploads: '/tmp/uploads', images: '/tmp/images' },
  }),
}));

jest.mock('~/server/middleware/config/app', () => (req, _res, next) => {
  req.config = {
    fileStrategy: 'local',
    paths: { uploads: '/tmp/uploads', images: '/tmp/images' },
    fileConfig: mockFileConfig,
    filters: mockFilters,
  };
  next();
});

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn().mockReturnValue({
    saveBuffer: jest.fn().mockResolvedValue('/uploads/test/file.txt'),
    getDownloadStream: jest.fn().mockResolvedValue({
      pipe: jest.fn(),
      on: jest.fn(),
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('test content');
      },
    }),
  }),
}));

jest.mock('~/server/utils/getFileStrategy', () => ({
  getFileStrategy: jest.fn().mockReturnValue('local'),
}));

jest.mock('~/server/services/Skills/sync', () => ({
  maybeRunGitHubSkillSyncForRequest: mockMaybeRunGitHubSkillSyncForRequest,
}));

jest.mock('~/models', () => {
  const mongoose = require('mongoose');
  const { createMethods } = require('@librechat/data-schemas');
  const methods = createMethods(mongoose, {
    removeAllPermissions: async ({ resourceType, resourceId }) => {
      const AclEntry = mongoose.models.AclEntry;
      if (AclEntry) {
        await AclEntry.deleteMany({ resourceType, resourceId });
      }
    },
  });
  // Override getRoleByName to return a permissive SKILLS capability block for all
  // test users. The real role seeding relies on `initializeRoles` which this
  // suite intentionally skips to keep setup minimal.
  return {
    ...methods,
    getRoleByName: jest.fn(),
  };
});

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => next(),
  canAccessSkillResource: jest.requireActual('~/server/middleware').canAccessSkillResource,
}));

let app;
let mongoServer;
let skillRoutes;
let Skill;
let SkillFile;
let AclEntry;
let AccessRole;
let User;
let testUsers;
let testRoles;
let grantPermission;
let currentTestUser;

function setTestUser(user) {
  currentTestUser = user;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const dbModels = require('~/db/models');
  Skill = dbModels.Skill;
  SkillFile = dbModels.SkillFile;
  AclEntry = dbModels.AclEntry;
  AccessRole = dbModels.AccessRole;
  User = dbModels.User;

  const permissionService = require('~/server/services/PermissionService');
  grantPermission = permissionService.grantPermission;

  await setupTestData();

  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (currentTestUser) {
      req.user = {
        ...(currentTestUser.toObject ? currentTestUser.toObject() : currentTestUser),
        id: currentTestUser._id.toString(),
        _id: currentTestUser._id,
        name: currentTestUser.name,
        role: currentTestUser.role,
      };
    }
    next();
  });

  currentTestUser = testUsers.owner;
  skillRoutes = require('./skills');
  app.use('/api/skills', skillRoutes);
});

afterEach(async () => {
  await Skill.deleteMany({});
  await SkillFile.deleteMany({});
  await AclEntry.deleteMany({});
  currentTestUser = testUsers.owner;
  mockFileConfig = undefined;
  mockFilters = undefined;
  mockMaybeRunGitHubSkillSyncForRequest.mockClear();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  jest.clearAllMocks();
});

async function setupTestData() {
  testRoles = {
    viewer: await AccessRole.create({
      accessRoleId: AccessRoleIds.SKILL_VIEWER,
      name: 'Viewer',
      resourceType: ResourceType.SKILL,
      permBits: PermissionBits.VIEW,
    }),
    editor: await AccessRole.create({
      accessRoleId: AccessRoleIds.SKILL_EDITOR,
      name: 'Editor',
      resourceType: ResourceType.SKILL,
      permBits: PermissionBits.VIEW | PermissionBits.EDIT,
    }),
    owner: await AccessRole.create({
      accessRoleId: AccessRoleIds.SKILL_OWNER,
      name: 'Owner',
      resourceType: ResourceType.SKILL,
      permBits:
        PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE,
    }),
  };

  testUsers = {
    owner: await User.create({
      name: 'Skill Owner',
      email: 'skill-owner@test.com',
      role: SystemRoles.USER,
    }),
    editor: await User.create({
      name: 'Skill Editor',
      email: 'skill-editor@test.com',
      role: SystemRoles.USER,
    }),
    noAccess: await User.create({
      name: 'No Access',
      email: 'no-access@test.com',
      role: SystemRoles.USER,
    }),
  };

  const { getRoleByName } = require('~/models');
  getRoleByName.mockImplementation((roleName) => {
    if (roleName === SystemRoles.USER || roleName === SystemRoles.ADMIN) {
      return {
        permissions: {
          SKILLS: {
            USE: true,
            CREATE: true,
            SHARE: true,
            SHARE_PUBLIC: true,
          },
        },
      };
    }
    return null;
  });
}

async function createSkillAsOwner(overrides = {}) {
  // Description is deliberately kept above the 20-char short-description
  // warning threshold so existing tests don't trip the coaching warning.
  const res = await request(app)
    .post('/api/skills')
    .send({
      name: 'demo-skill',
      description: 'A small demo skill used in routing integration tests.',
      body: '# Demo',
      ...overrides,
    });
  return res;
}

function createOverflowingFrontmatter(visible) {
  const root = { visible };
  let current = root;
  for (let depth = 0; depth < CONTENT_TRAVERSAL_MAX_DEPTH; depth++) {
    current.nested = {};
    current = current.nested;
  }
  current.nested = { hidden: 'PRIVATE-HIDDEN' };
  return root;
}

describe('Skill routes', () => {
  let errSpy;
  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation();
  });
  afterEach(() => errSpy.mockRestore());

  describe('POST /api/skills', () => {
    it('creates a skill and grants SKILL_OWNER ACL', async () => {
      const res = await createSkillAsOwner();
      expect(res.status).toBe(201);
      expect(res.body._id).toBeDefined();
      expect(res.body.version).toBe(1);
      expect(res.body.name).toBe('demo-skill');
      // No warnings on a description that comfortably clears the threshold.
      expect(res.body.warnings).toBeUndefined();

      const acl = await AclEntry.findOne({
        resourceType: ResourceType.SKILL,
        resourceId: res.body._id,
        principalType: PrincipalType.USER,
        principalId: testUsers.owner._id,
      });
      expect(acl).toBeTruthy();
      expect(acl.roleId.toString()).toBe(testRoles.owner._id.toString());
    });

    it('attaches a TOO_SHORT warning on create when description is under 20 chars', async () => {
      const res = await createSkillAsOwner({
        name: 'short-desc-skill',
        description: 'Too short.',
      });
      expect(res.status).toBe(201);
      expect(res.body._id).toBeDefined();
      expect(Array.isArray(res.body.warnings)).toBe(true);
      expect(res.body.warnings).toEqual([
        expect.objectContaining({
          field: 'description',
          code: 'TOO_SHORT',
          severity: 'warning',
        }),
      ]);
    });

    it('rejects names starting with reserved brand prefixes', async () => {
      const anthropic = await createSkillAsOwner({ name: 'anthropic-helper' });
      expect(anthropic.status).toBe(400);
      const claude = await createSkillAsOwner({ name: 'claude-helper' });
      expect(claude.status).toBe(400);
    });

    it('allows names that merely contain reserved brand words as substrings', async () => {
      const res = await createSkillAsOwner({ name: 'research-anthropic-helper' });
      expect(res.status).toBe(201);
    });

    it('rejects reserved CLI command names', async () => {
      const res = await createSkillAsOwner({ name: 'settings' });
      expect(res.status).toBe(400);
    });

    it('accepts frontmatter with unknown keys and warns about them', async () => {
      const res = await createSkillAsOwner({
        name: 'unknown-key-frontmatter-skill',
        frontmatter: { 'not-a-real-key': 'value' },
      });
      expect(res.status).toBe(201);
      expect(res.body.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'UNKNOWN_KEY', severity: 'warning' }),
        ]),
      );
    });

    it('rejects malformed frontmatter with 400', async () => {
      const res = await createSkillAsOwner({
        name: 'bad-frontmatter-skill',
        frontmatter: { 'user-invocable': 'yes' },
      });
      expect(res.status).toBe(400);
      expect(res.body.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'INVALID_TYPE' })]),
      );
    });

    it('rejects missing description with 400', async () => {
      const res = await request(app).post('/api/skills').send({ name: 'x-skill', body: '' });
      expect(res.status).toBe(400);
    });

    it('rejects invalid name with 400 validation failure', async () => {
      const res = await createSkillAsOwner({ name: 'BAD NAME' });
      expect(res.status).toBe(400);
      expect(res.body.issues).toBeDefined();
    });

    it('rejects duplicate names with 409', async () => {
      const a = await createSkillAsOwner();
      expect(a.status).toBe(201);
      const b = await createSkillAsOwner();
      expect(b.status).toBe(409);
    });

    it('blocks configured skill fields before creating a skill', async () => {
      mockFilters = {
        skills: {
          pii: {
            fields: ['instructions'],
            starterPatterns: [],
            customPatterns: [
              { id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' },
            ],
          },
        },
      };

      const res = await createSkillAsOwner({ body: 'Use PRIVATE-1234 to authenticate.' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: 'content_filter_block',
          source: 'skill',
          field: 'instructions',
        }),
      );
      expect(await Skill.countDocuments()).toBe(0);
    });

    it('blocks an inspected partial frontmatter fragment before traversal exhaustion', async () => {
      mockFilters = {
        skills: {
          pii: {
            fields: ['frontmatter'],
            starterPatterns: [],
            customPatterns: [
              { id: 'partial_content', label: 'partial content', regex: 'PRIVATE-VISIBLE' },
            ],
          },
        },
      };

      const res = await createSkillAsOwner({
        frontmatter: createOverflowingFrontmatter('PRIVATE-VISIBLE'),
      });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: 'content_filter_block',
          source: 'skill',
          field: 'frontmatter',
        }),
      );
      expect(await Skill.countDocuments()).toBe(0);
    });

    it('fails closed when selected skill frontmatter cannot be fully inspected', async () => {
      mockFilters = {
        skills: {
          pii: {
            fields: ['frontmatter'],
            starterPatterns: [],
            customPatterns: [
              { id: 'protected_content', label: 'protected content', regex: 'PRIVATE-NOT-PRESENT' },
            ],
          },
        },
      };

      const res = await createSkillAsOwner({
        frontmatter: createOverflowingFrontmatter('safe visible value'),
      });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'content_filter_uninspectable',
        message: 'Submitted content could not be completely inspected before processing.',
        source: 'skill',
        field: 'frontmatter',
      });
      expect(await Skill.countDocuments()).toBe(0);
    });

    it('does not fail closed on oversized frontmatter when only another field is selected', async () => {
      mockFilters = {
        skills: {
          pii: {
            fields: ['description'],
            starterPatterns: [],
            customPatterns: [
              { id: 'protected_description', label: 'protected description', regex: 'PRIVATE' },
            ],
          },
        },
      };

      const res = await createSkillAsOwner({
        description: 'A safe skill description used for traversal coverage.',
        frontmatter: createOverflowingFrontmatter('PRIVATE-VISIBLE'),
      });

      expect(res.status).toBe(400);
      expect(res.body.error).not.toBe('content_filter_uninspectable');
      expect(res.body.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'INVALID_SHAPE' })]),
      );
      expect(await Skill.countDocuments()).toBe(0);
    });

    it('honors skill field granularity', async () => {
      mockFilters = {
        skills: {
          pii: {
            fields: ['description'],
            starterPatterns: [],
            customPatterns: [
              { id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' },
            ],
          },
        },
      };

      const res = await createSkillAsOwner({ body: 'Use PRIVATE-1234 to authenticate.' });

      expect(res.status).toBe(201);
    });
  });

  describe('POST /api/skills/import', () => {
    it('enforces fileConfig.skills.fileSizeLimit before import handling', async () => {
      mockFileConfig = {
        skills: {
          fileSizeLimit: 1,
        },
      };

      const res = await request(app)
        .post('/api/skills/import')
        .attach('file', Buffer.alloc(2 * 1024 * 1024), {
          filename: 'too-large.skill',
          contentType: 'application/zip',
        });

      const { mergeFileConfig } = require('librechat-data-provider');
      expect(mergeFileConfig).toHaveBeenCalledWith(mockFileConfig);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/file too large/i);
    });

    it('persists storage metadata for imported skill files', async () => {
      const savedFilepath =
        'https://cdn.example.com/r/us-east-2/uploads/user123/imported-script.sh';
      const saveBuffer = jest.fn().mockResolvedValue(savedFilepath);
      const { getFileStrategy } = require('~/server/utils/getFileStrategy');
      const { getStrategyFunctions } = require('~/server/services/Files/strategies');
      getFileStrategy.mockReturnValueOnce('cloudfront');
      getStrategyFunctions.mockReturnValueOnce({ saveBuffer });

      const zip = new JSZip();
      zip.file(
        'SKILL.md',
        [
          '---',
          'name: imported-skill',
          'description: Imported skill description for route tests.',
          '---',
          '# Imported Skill',
        ].join('\n'),
      );
      zip.file('scripts/imported-script.sh', 'echo imported');
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      const res = await request(app).post('/api/skills/import').attach('file', buffer, {
        filename: 'imported-skill.skill',
        contentType: 'application/zip',
      });

      expect(res.status).toBe(201);
      expect(saveBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUsers.owner._id.toString(),
          basePath: 'uploads',
        }),
      );

      const savedFile = await SkillFile.findOne({
        relativePath: 'scripts/imported-script.sh',
      }).lean();
      expect(savedFile).toEqual(
        expect.objectContaining({
          filepath: savedFilepath,
          source: 'cloudfront',
          storageKey: 'r/us-east-2/uploads/user123/imported-script.sh',
          storageRegion: 'us-east-2',
        }),
      );
    });

    it('blocks filtered Markdown before creating the imported skill', async () => {
      mockFilters = {
        files: {
          pii: {
            fields: ['extracted_text'],
            starterPatterns: [],
            customPatterns: [
              { id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' },
            ],
          },
        },
      };

      const markdown = [
        '---',
        'name: filtered-import',
        'description: Imported skill with enough description.',
        '---',
        'Use PRIVATE-1234 to authenticate.',
      ].join('\n');
      const res = await request(app)
        .post('/api/skills/import')
        .attach('file', Buffer.from(markdown), {
          filename: 'filtered-import.md',
          contentType: 'text/markdown',
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: 'content_filter_block',
          source: 'file',
          field: 'extracted_text',
        }),
      );
      expect(await Skill.countDocuments()).toBe(0);
      expect(await SkillFile.countDocuments()).toBe(0);
    });
  });

  describe('GET /api/skills', () => {
    it('returns only skills the caller can access', async () => {
      const mine = await createSkillAsOwner({ name: 'mine-skill' });
      expect(mine.status).toBe(201);

      setTestUser(testUsers.noAccess);
      const other = await createSkillAsOwner({ name: 'other-skill' });
      expect(other.status).toBe(201);
      // Note: the user middleware grants owner perms to whichever user created, so both
      // users see their own skill only.

      setTestUser(testUsers.owner);
      const res = await request(app).get('/api/skills');
      expect(res.status).toBe(200);
      expect(mockMaybeRunGitHubSkillSyncForRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ fileStrategy: 'local' }),
          user: expect.objectContaining({ id: testUsers.owner._id.toString() }),
        }),
      );
      expect(res.body.skills.length).toBe(1);
      expect(res.body.skills[0].name).toBe('mine-skill');
    });
  });

  describe('GET /api/skills/:id', () => {
    it('returns 403 when the user has no access', async () => {
      const created = await createSkillAsOwner();
      expect(created.status).toBe(201);
      setTestUser(testUsers.noAccess);
      const res = await request(app).get(`/api/skills/${created.body._id}`);
      expect(res.status).toBe(403);
    });

    it('returns the skill to the owner with isPublic flag', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).get(`/api/skills/${created.body._id}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('demo-skill');
      expect(res.body.isPublic).toBe(false);
    });
  });

  describe('PATCH /api/skills/:id (optimistic concurrency)', () => {
    it('updates with correct expectedVersion and bumps version', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, description: 'Updated description' });
      expect(res.status).toBe(200);
      expect(res.body.version).toBe(2);
      expect(res.body.description).toBe('Updated description');
    });

    it('returns 409 on stale expectedVersion', async () => {
      const created = await createSkillAsOwner();
      const first = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, description: 'First' });
      expect(first.status).toBe(200);

      const stale = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, description: 'Stale' });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe('skill_version_conflict');
      expect(stale.body.current.version).toBe(2);
    });

    it('rejects updates without expectedVersion', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ description: 'no version' });
      expect(res.status).toBe(400);
    });

    it('returns 403 for a user without EDIT permission', async () => {
      const created = await createSkillAsOwner();
      setTestUser(testUsers.noAccess);
      const res = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, description: 'nope' });
      expect(res.status).toBe(403);
    });

    it('stores manualMinutes and returns metrics computed from the stored counters', async () => {
      const created = await createSkillAsOwner();
      await Skill.updateOne(
        { _id: created.body._id },
        { $set: { useCount: 12, runTimeTotalSeconds: 120, runTimeSampleCount: 2 } },
      );
      const res = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, manualMinutes: 16 });
      expect(res.status).toBe(200);
      expect(res.body.manualMinutes).toBe(16);
      expect(res.body.usageMetrics).toEqual({
        averageRunSeconds: 60,
        savedMinutesPerRun: 15,
        savedHours: 3,
      });

      const list = await request(app).get('/api/skills');
      expect(list.body.skills[0]).toMatchObject({
        useCount: 12,
        manualMinutes: 16,
        usageMetrics: { averageRunSeconds: 60, savedMinutesPerRun: 15, savedHours: 3 },
      });
    });

    it.each([-1, 2.5, '10', null])('rejects manualMinutes %p', async (manualMinutes) => {
      const created = await createSkillAsOwner();
      const res = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, manualMinutes });
      expect(res.status).toBe(400);
      const persisted = await Skill.findById(created.body._id).lean();
      expect(persisted.manualMinutes).toBeUndefined();
      expect(persisted.version).toBe(1);
    });

    it('blocks configured content before updating a skill', async () => {
      const created = await createSkillAsOwner();
      mockFilters = {
        skills: {
          pii: {
            fields: ['description'],
            starterPatterns: [],
            customPatterns: [
              { id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' },
            ],
          },
        },
      };

      const res = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, description: 'Contains PRIVATE-1234.' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: 'content_filter_block',
          source: 'skill',
          field: 'description',
        }),
      );
      const persisted = await Skill.findById(created.body._id).lean();
      expect(persisted.version).toBe(1);
      expect(persisted.description).toBe('A small demo skill used in routing integration tests.');
    });
  });

  describe('DELETE /api/skills/:id', () => {
    it('deletes and cascades ACL entries', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).delete(`/api/skills/${created.body._id}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);

      const remainingAcl = await AclEntry.countDocuments({
        resourceType: ResourceType.SKILL,
        resourceId: created.body._id,
      });
      expect(remainingAcl).toBe(0);
    });

    it('returns 403 for a non-owner', async () => {
      const created = await createSkillAsOwner();
      setTestUser(testUsers.noAccess);
      const res = await request(app).delete(`/api/skills/${created.body._id}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/skills/:id/files', () => {
    it('returns an empty list for a skill with no files', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).get(`/api/skills/${created.body._id}/files`);
      expect(res.status).toBe(200);
      expect(res.body.files).toEqual([]);
    });
  });

  describe('POST /api/skills/:id/files (live)', () => {
    it('returns 400 when no file is provided', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).post(`/api/skills/${created.body._id}/files`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no file/i);
    });

    it('blocks text file content before storage', async () => {
      const created = await createSkillAsOwner();
      mockFilters = {
        files: {
          pii: {
            fields: ['extracted_text'],
            starterPatterns: [],
            customPatterns: [
              { id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' },
            ],
          },
        },
      };

      const res = await request(app)
        .post(`/api/skills/${created.body._id}/files`)
        .field('relativePath', 'references/notes.txt')
        .attach('file', Buffer.from('PRIVATE-1234'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: 'content_filter_block',
          source: 'file',
          field: 'extracted_text',
        }),
      );
      expect(await SkillFile.countDocuments()).toBe(0);
    });

    it('does not decode binary file bytes for filtering', async () => {
      const created = await createSkillAsOwner();
      mockFilters = {
        files: {
          pii: {
            fields: ['extracted_text'],
            starterPatterns: [],
            customPatterns: [
              { id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' },
            ],
          },
        },
      };
      const binary = Buffer.concat([Buffer.from([0, 255, 0]), Buffer.from('PRIVATE-1234')]);

      const res = await request(app)
        .post(`/api/skills/${created.body._id}/files`)
        .field('relativePath', 'assets/private.png')
        .attach('file', binary, {
          filename: 'private.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(200);
      expect(await SkillFile.countDocuments()).toBe(1);
    });

    it('blocks an opaque skill file before storage when configured fail-closed', async () => {
      const created = await createSkillAsOwner();
      mockFilters = {
        files: {
          pii: {
            fields: ['content'],
            uninspectable: 'block',
          },
        },
      };
      const binary = Buffer.from([0, 255, 0, 137, 80, 78, 71]);

      const res = await request(app)
        .post(`/api/skills/${created.body._id}/files`)
        .field('relativePath', 'assets/private.png')
        .attach('file', binary, {
          filename: 'private.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'content_filter_uninspectable',
        message: 'Submitted file content could not be inspected before processing.',
        source: 'file',
        field: 'content',
      });
      expect(await SkillFile.countDocuments()).toBe(0);
    });

    it('blocks opaque uploads when the skill file_text policy is enabled', async () => {
      const created = await createSkillAsOwner();
      mockFilters = {
        skills: {
          pii: {
            fields: ['file_text'],
            starterPatterns: ['sk_prefix'],
          },
        },
        files: {
          pii: {
            fields: ['content'],
            uninspectable: 'allow',
          },
        },
      };
      const binary = Buffer.from([0, 255, 0, 137, 80, 78, 71]);

      const res = await request(app)
        .post(`/api/skills/${created.body._id}/files`)
        .field('relativePath', 'assets/private.png')
        .attach('file', binary, {
          filename: 'private.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: 'content_filter_uninspectable',
          source: 'file',
          field: 'content',
        }),
      );
      expect(await SkillFile.countDocuments()).toBe(0);
    });
  });

  describe('GET /api/skills/:id/files/*relativePath', () => {
    const { upsertSkillFile, updateSkillFileContent } = require('~/models');

    async function seedNestedFile(skillId, relativePath, content) {
      await upsertSkillFile({
        skillId,
        relativePath,
        file_id: `file-${relativePath}`,
        filename: relativePath.split('/').pop(),
        filepath: `/tmp/${relativePath}`,
        source: 'local',
        mimeType: 'text/markdown',
        bytes: content.length,
        author: testUsers.owner._id,
      });
      // Seed cached content so the handler returns it without streaming
      await updateSkillFileContent(skillId, relativePath, { content, isBinary: false });
    }

    it('returns SKILL.md content from skill body', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).get(`/api/skills/${created.body._id}/files/SKILL.md`);
      expect(res.status).toBe(200);
      expect(res.body.mimeType).toBe('text/markdown');
      expect(res.body.isBinary).toBe(false);
      expect(res.body.filename).toBe('SKILL.md');
      expect(res.body.content).toBeDefined();
    });

    it('returns a nested file when the path is percent-encoded (%2F)', async () => {
      const created = await createSkillAsOwner();
      await seedNestedFile(created.body._id, 'references/working-patterns.md', 'nested body');
      const res = await request(app).get(
        `/api/skills/${created.body._id}/files/references%2Fworking-patterns.md`,
      );
      expect(res.status).toBe(200);
      expect(res.body.relativePath).toBe('references/working-patterns.md');
      expect(res.body.content).toBe('nested body');
    });

    it('returns a nested file when a proxy decoded %2F to a literal slash', async () => {
      const created = await createSkillAsOwner();
      await seedNestedFile(created.body._id, 'references/working-patterns.md', 'nested body');
      const res = await request(app).get(
        `/api/skills/${created.body._id}/files/references/working-patterns.md`,
      );
      expect(res.status).toBe(200);
      expect(res.body.relativePath).toBe('references/working-patterns.md');
      expect(res.body.content).toBe('nested body');
    });

    it('returns a deeply nested file (multiple subfolders)', async () => {
      const created = await createSkillAsOwner();
      await seedNestedFile(created.body._id, 'assets/img/icons/logo.md', 'deep');
      const res = await request(app).get(
        `/api/skills/${created.body._id}/files/assets/img/icons/logo.md`,
      );
      expect(res.status).toBe(200);
      expect(res.body.relativePath).toBe('assets/img/icons/logo.md');
      expect(res.body.content).toBe('deep');
    });

    it('returns 404 for a nonexistent file', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).get(
        `/api/skills/${created.body._id}/files/scripts%2Fmissing.sh`,
      );
      expect(res.status).toBe(404);
    });

    it('returns 404 for a path traversal attempt', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).get(
        `/api/skills/${created.body._id}/files/references%2F..%2F..%2Fetc%2Fpasswd`,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/skills/:id/files/*relativePath', () => {
    const { upsertSkillFile } = require('~/models');

    it('deletes an existing skill file, bumps skill version, and returns 200', async () => {
      const created = await createSkillAsOwner();
      await upsertSkillFile({
        skillId: created.body._id,
        relativePath: 'scripts/parse.sh',
        file_id: 'file-1',
        filename: 'parse.sh',
        filepath: '/tmp/parse.sh',
        source: 'local',
        mimeType: 'text/x-shellscript',
        bytes: 42,
        author: testUsers.owner._id,
      });

      const beforeSkill = await request(app).get(`/api/skills/${created.body._id}`);
      expect(beforeSkill.body.fileCount).toBe(1);
      expect(beforeSkill.body.version).toBe(2);

      const res = await request(app).delete(
        `/api/skills/${created.body._id}/files/scripts%2Fparse.sh`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        skillId: created.body._id,
        relativePath: 'scripts/parse.sh',
        deleted: true,
      });

      const afterSkill = await request(app).get(`/api/skills/${created.body._id}`);
      expect(afterSkill.body.fileCount).toBe(0);
      expect(afterSkill.body.version).toBe(3);
    });

    it('deletes a nested file when a proxy decoded %2F to a literal slash', async () => {
      const created = await createSkillAsOwner();
      await upsertSkillFile({
        skillId: created.body._id,
        relativePath: 'references/notes.md',
        file_id: 'file-2',
        filename: 'notes.md',
        filepath: '/tmp/notes.md',
        source: 'local',
        mimeType: 'text/markdown',
        bytes: 12,
        author: testUsers.owner._id,
      });

      const res = await request(app).delete(
        `/api/skills/${created.body._id}/files/references/notes.md`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        skillId: created.body._id,
        relativePath: 'references/notes.md',
        deleted: true,
      });

      const afterSkill = await request(app).get(`/api/skills/${created.body._id}`);
      expect(afterSkill.body.fileCount).toBe(0);
    });

    it('returns 404 when the file does not exist', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app).delete(
        `/api/skills/${created.body._id}/files/scripts%2Fmissing.sh`,
      );
      expect(res.status).toBe(404);
    });

    it('returns 403 for a non-owner', async () => {
      const created = await createSkillAsOwner();
      setTestUser(testUsers.noAccess);
      const res = await request(app).delete(
        `/api/skills/${created.body._id}/files/scripts%2Fparse.sh`,
      );
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/skills/:id/fork', () => {
    async function createSharedSkillWithFile() {
      const created = await createSkillAsOwner({ body: '# Weekly report\n\nSummarize the week.' });
      await Skill.updateOne({ _id: created.body._id }, { $set: { manualMinutes: 40 } });
      const upload = await request(app)
        .post(`/api/skills/${created.body._id}/files`)
        .field('relativePath', 'references/guide.md')
        .attach('file', Buffer.from('guide'), {
          filename: 'guide.md',
          contentType: 'text/markdown',
        });
      expect(upload.status).toBe(200);
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.editor._id,
        resourceType: ResourceType.SKILL,
        resourceId: created.body._id,
        accessRoleId: AccessRoleIds.SKILL_VIEWER,
        grantedBy: testUsers.owner._id,
      });
      return created.body;
    }

    it('copies the body and files into a skill owned by the caller', async () => {
      const original = await createSharedSkillWithFile();

      setTestUser(testUsers.editor);
      const res = await request(app).post(`/api/skills/${original._id}/fork`).send({});

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: 'demo-skill',
        body: '# Weekly report\n\nSummarize the week.',
        author: testUsers.editor._id.toString(),
        forkOf: original._id,
        forkCount: 0,
        useCount: 0,
        manualMinutes: 40,
        fileCount: 1,
        _forkSummary: { filesProcessed: 1, filesSucceeded: 1, filesFailed: 0, errors: [] },
      });
      const copiedFiles = await SkillFile.find({ skillId: res.body._id }).lean();
      expect(copiedFiles.map((file) => file.relativePath)).toEqual(['references/guide.md']);
      const ownerAcl = await AclEntry.findOne({
        resourceType: ResourceType.SKILL,
        resourceId: res.body._id,
        principalType: PrincipalType.USER,
        principalId: testUsers.editor._id,
      });
      expect(ownerAcl.roleId.toString()).toBe(testRoles.owner._id.toString());
    });

    it('counts a fork toward the original only while the copy is shared', async () => {
      const original = await createSharedSkillWithFile();
      setTestUser(testUsers.editor);
      const fork = await request(app).post(`/api/skills/${original._id}/fork`).send({});
      expect(fork.status).toBe(201);

      setTestUser(testUsers.owner);
      const privateCopy = await request(app).get(`/api/skills/${original._id}`);
      expect(privateCopy.body.forkCount).toBe(0);

      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.noAccess._id,
        resourceType: ResourceType.SKILL,
        resourceId: fork.body._id,
        accessRoleId: AccessRoleIds.SKILL_VIEWER,
        grantedBy: testUsers.editor._id,
      });
      const sharedCopy = await request(app).get(`/api/skills/${original._id}`);
      expect(sharedCopy.body.forkCount).toBe(1);
      const list = await request(app).get('/api/skills');
      expect(list.body.skills.find((skill) => skill._id === original._id).forkCount).toBe(1);

      await AclEntry.deleteOne({ resourceId: fork.body._id, principalId: testUsers.noAccess._id });
      const unshared = await request(app).get(`/api/skills/${original._id}`);
      expect(unshared.body.forkCount).toBe(0);
    });

    it('adds a -fork suffix when the caller already owns the name', async () => {
      const original = await createSharedSkillWithFile();
      const res = await request(app).post(`/api/skills/${original._id}/fork`).send({});
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('demo-skill-fork');
      expect(res.body.author).toBe(testUsers.owner._id.toString());
    });

    it('returns 409 when the requested name is already taken by the caller', async () => {
      const original = await createSharedSkillWithFile();
      const res = await request(app)
        .post(`/api/skills/${original._id}/fork`)
        .send({ name: 'demo-skill' });
      expect(res.status).toBe(409);
      expect(await Skill.countDocuments({ forkOf: original._id })).toBe(0);
    });

    it('returns 403 to a user who cannot view the original', async () => {
      const original = await createSharedSkillWithFile();
      setTestUser(testUsers.noAccess);
      const res = await request(app).post(`/api/skills/${original._id}/fork`).send({});
      expect(res.status).toBe(403);
      expect(await Skill.countDocuments({ forkOf: original._id })).toBe(0);
    });
  });

  describe('Sharing via ACL (editor grant)', () => {
    it('allows an editor to patch a shared skill', async () => {
      const created = await createSkillAsOwner();
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.editor._id,
        resourceType: ResourceType.SKILL,
        resourceId: created.body._id,
        accessRoleId: AccessRoleIds.SKILL_EDITOR,
        grantedBy: testUsers.owner._id,
      });

      setTestUser(testUsers.editor);
      const res = await request(app)
        .patch(`/api/skills/${created.body._id}`)
        .send({ expectedVersion: 1, description: 'Edited by editor' });
      expect(res.status).toBe(200);

      // Editor should NOT be able to delete
      const del = await request(app).delete(`/api/skills/${created.body._id}`);
      expect(del.status).toBe(403);
    });
  });
});

describe('Skill builder routes', () => {
  let Conversation;
  let Message;
  let errSpy;
  let warnSpy;

  beforeAll(() => {
    ({ Conversation, Message } = require('~/db/models'));
  });
  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });
  afterEach(async () => {
    errSpy.mockRestore();
    warnSpy.mockRestore();
    await Conversation.deleteMany({});
    await Message.deleteMany({});
  });

  async function insertTestTurn({ user, conversationId, skillName, response = {} }) {
    const userId = user._id.toString();
    await Conversation.collection.insertOne({ conversationId, user: userId, title: 'test' });
    await Message.collection.insertMany([
      {
        messageId: `${conversationId}-user`,
        conversationId,
        user: userId,
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        isCreatedByUser: true,
        text: '시작해줘',
        manualSkills: [skillName],
        createdAt: new Date('2026-09-27T01:00:00.000Z'),
        updatedAt: new Date('2026-09-27T01:00:00.000Z'),
      },
      {
        messageId: `${conversationId}-response`,
        conversationId,
        user: userId,
        parentMessageId: `${conversationId}-user`,
        isCreatedByUser: false,
        text: '결과입니다.',
        error: false,
        unfinished: false,
        createdAt: new Date('2026-09-27T01:00:01.000Z'),
        updatedAt: new Date('2026-09-27T01:00:12.000Z'),
        ...response,
      },
    ]);
  }

  async function createTestedSkill() {
    const created = await createSkillAsOwner();
    const patched = await request(app)
      .patch(`/api/skills/${created.body._id}`)
      .send({ expectedVersion: 1, manualMinutes: 30 });
    expect(patched.status).toBe(200);
    await insertTestTurn({
      user: testUsers.owner,
      conversationId: 'convo-owner',
      skillName: 'demo-skill',
    });
    const tested = await request(app)
      .post(`/api/skills/${created.body._id}/test-result`)
      .send({ conversationId: 'convo-owner', version: patched.body.version });
    expect(tested.status).toBe(200);
    return tested.body;
  }

  describe('POST /api/skills/draft', () => {
    it('answers 429 in JSON once a user passes the draft limit', async () => {
      setTestUser(testUsers.noAccess);
      const send = () =>
        request(app).post('/api/skills/draft').send({ text: '회의록을 보고서로 만들어줘.' });

      for (let i = 0; i < DRAFT_USER_MAX_FOR_TEST; i++) {
        const allowed = await send();
        expect(allowed.status).toBe(200);
      }
      const limited = await send();
      expect(limited.status).toBe(429);
      expect(limited.headers['content-type']).toMatch(/application\/json/);
      expect(limited.body.message).toEqual(expect.any(String));

      const getLogStores = require('~/cache/getLogStores');
      const { ViolationTypes } = require('librechat-data-provider');
      const violations = await getLogStores(ViolationTypes.SKILL_DRAFT_LIMIT).get(
        testUsers.noAccess._id.toString(),
      );
      expect(violations).toBe(0);

      setTestUser(testUsers.editor);
      const otherUser = await send();
      expect(otherUser.status).toBe(200);
    }, 20000);

    it('rejects a request without text', async () => {
      const res = await request(app).post('/api/skills/draft').send({});
      expect(res.status).toBe(400);
    });

    it('returns a rule-based draft when no default agent is configured', async () => {
      const res = await request(app)
        .post('/api/skills/draft')
        .send({ text: '회의록을 보고서로 만들어줘. 결정 사항을 먼저 적는다.' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          slug: 'meeting-report',
          output: 'report',
          origin: 'rules',
          steps: ['결정 사항을 먼저 적는다.'],
        }),
      );
    });

    it('suffixes a slug the caller already uses but not one another user owns', async () => {
      await createSkillAsOwner({ name: 'meeting-report' });

      const mine = await request(app)
        .post('/api/skills/draft')
        .send({ text: '회의록을 보고서로 만들어줘.' });
      expect(mine.body.slug).toBe('meeting-report-2');

      setTestUser(testUsers.editor);
      const theirs = await request(app)
        .post('/api/skills/draft')
        .send({ text: '회의록을 보고서로 만들어줘.' });
      expect(theirs.body.slug).toBe('meeting-report');
    });

    it("refuses to read another user's conversation", async () => {
      await insertTestTurn({
        user: testUsers.editor,
        conversationId: 'convo-editor',
        skillName: 'demo-skill',
      });
      const res = await request(app)
        .post('/api/skills/draft')
        .send({ text: '회의록 보고서', context: { conversationId: 'convo-editor' } });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/skills/:id/test-result', () => {
    it('records the test on the current version without bumping it', async () => {
      const created = await createSkillAsOwner();
      await insertTestTurn({
        user: testUsers.owner,
        conversationId: 'convo-owner',
        skillName: 'demo-skill',
      });

      const res = await request(app)
        .post(`/api/skills/${created.body._id}/test-result`)
        .send({ conversationId: 'convo-owner', version: 1 });

      expect(res.status).toBe(200);
      expect(res.body.version).toBe(1);
      expect(res.body.lastTest).toEqual(
        expect.objectContaining({ version: 1, seconds: 12, conversationId: 'convo-owner' }),
      );
      const stored = await Skill.findById(created.body._id).lean();
      expect(stored.version).toBe(1);
      expect(stored.lastTest.version).toBe(1);
    });

    it('lets a content edit after the test withdraw the pass', async () => {
      const tested = await createTestedSkill();
      const edited = await request(app)
        .patch(`/api/skills/${tested._id}`)
        .send({ expectedVersion: tested.version, body: '# Demo changed' });
      expect(edited.status).toBe(200);
      expect(edited.body.version).toBe(tested.version + 1);

      const res = await request(app)
        .post(`/api/skills/${tested._id}/publish`)
        .send({ scope: 'all' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TEST_REQUIRED');
    });

    it('rejects a caller without edit access', async () => {
      const created = await createSkillAsOwner();
      setTestUser(testUsers.noAccess);
      await insertTestTurn({
        user: testUsers.noAccess,
        conversationId: 'convo-intruder',
        skillName: 'demo-skill',
      });
      const res = await request(app)
        .post(`/api/skills/${created.body._id}/test-result`)
        .send({ conversationId: 'convo-intruder', version: 1 });
      expect(res.status).toBe(403);
      expect((await Skill.findById(created.body._id).lean()).lastTest).toBeUndefined();
    });

    it("rejects another user's conversation", async () => {
      const created = await createSkillAsOwner();
      await insertTestTurn({
        user: testUsers.editor,
        conversationId: 'convo-editor',
        skillName: 'demo-skill',
      });
      const res = await request(app)
        .post(`/api/skills/${created.body._id}/test-result`)
        .send({ conversationId: 'convo-editor', version: 1 });
      expect(res.status).toBe(404);
    });

    it('rejects a stale version', async () => {
      const created = await createSkillAsOwner();
      await insertTestTurn({
        user: testUsers.owner,
        conversationId: 'convo-owner',
        skillName: 'demo-skill',
      });
      const res = await request(app)
        .post(`/api/skills/${created.body._id}/test-result`)
        .send({ conversationId: 'convo-owner', version: 7 });
      expect(res.status).toBe(409);
      expect(res.body.current.version).toBe(1);
    });

    it('rejects a turn the user stopped', async () => {
      const created = await createSkillAsOwner();
      await insertTestTurn({
        user: testUsers.owner,
        conversationId: 'convo-owner',
        skillName: 'demo-skill',
        response: { finish_reason: 'incomplete', content: [{ type: 'text', text: '중간' }] },
      });
      const res = await request(app)
        .post(`/api/skills/${created.body._id}/test-result`)
        .send({ conversationId: 'convo-owner', version: 1 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('RESPONSE_FAILED');
    });

    it('rejects a turn with an error content part', async () => {
      const created = await createSkillAsOwner();
      await insertTestTurn({
        user: testUsers.owner,
        conversationId: 'convo-owner',
        skillName: 'demo-skill',
        response: {
          content: [
            { type: 'text', text: '결과' },
            { type: 'error', error: 'tool' },
          ],
        },
      });
      const res = await request(app)
        .post(`/api/skills/${created.body._id}/test-result`)
        .send({ conversationId: 'convo-owner', version: 1 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('RESPONSE_FAILED');
    });

    it('rejects a turn whose response ended in an error', async () => {
      const created = await createSkillAsOwner();
      await insertTestTurn({
        user: testUsers.owner,
        conversationId: 'convo-owner',
        skillName: 'demo-skill',
        response: { error: true },
      });
      const res = await request(app)
        .post(`/api/skills/${created.body._id}/test-result`)
        .send({ conversationId: 'convo-owner', version: 1 });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('RESPONSE_FAILED');
    });
  });

  describe('POST /api/skills/:id/publish', () => {
    function publicEntry(skillId) {
      return AclEntry.findOne({
        resourceType: ResourceType.SKILL,
        resourceId: skillId,
        principalType: PrincipalType.PUBLIC,
      }).lean();
    }

    it('refuses to publish an untested skill', async () => {
      const created = await createSkillAsOwner();
      const res = await request(app)
        .post(`/api/skills/${created.body._id}/publish`)
        .send({ scope: 'all' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TEST_REQUIRED');
      expect(await publicEntry(created.body._id)).toBeNull();
    });

    it('publishes to everyone, then back to the owner only', async () => {
      const tested = await createTestedSkill();
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.editor._id,
        resourceType: ResourceType.SKILL,
        resourceId: tested._id,
        accessRoleId: AccessRoleIds.SKILL_EDITOR,
        grantedBy: testUsers.owner._id,
      });

      const shared = await request(app)
        .post(`/api/skills/${tested._id}/publish`)
        .send({ scope: 'all' });
      expect(shared.status).toBe(200);
      expect(shared.body.isPublic).toBe(true);
      expect(typeof shared.body.publishedAt).toBe('string');
      expect(shared.body.version).toBe(tested.version);
      expect(shared.body.lastTest.version).toBe(tested.version);
      const entry = await publicEntry(tested._id);
      expect(entry.roleId.toString()).toBe(testRoles.viewer._id.toString());

      const privateAgain = await request(app)
        .post(`/api/skills/${tested._id}/publish`)
        .send({ scope: 'me' });
      expect(privateAgain.status).toBe(200);
      expect(privateAgain.body.isPublic).toBe(false);
      const remaining = await AclEntry.find({
        resourceType: ResourceType.SKILL,
        resourceId: tested._id,
      }).lean();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].principalType).toBe(PrincipalType.USER);
      expect(remaining[0].principalId.toString()).toBe(testUsers.owner._id.toString());
      expect(remaining[0].roleId.toString()).toBe(testRoles.owner._id.toString());
    });

    it('keeps updatedAt while recording a test and publishing', async () => {
      const created = await createSkillAsOwner();
      const before = (await Skill.findById(created.body._id).lean()).updatedAt;
      await Skill.updateOne(
        { _id: created.body._id },
        { $set: { manualMinutes: 30 } },
        { timestamps: false },
      );
      await insertTestTurn({
        user: testUsers.owner,
        conversationId: 'convo-owner',
        skillName: 'demo-skill',
      });
      const tested = await request(app)
        .post(`/api/skills/${created.body._id}/test-result`)
        .send({ conversationId: 'convo-owner', version: 1 });
      expect(tested.status).toBe(200);
      const published = await request(app)
        .post(`/api/skills/${created.body._id}/publish`)
        .send({ scope: 'all' });
      expect(published.status).toBe(200);
      expect((await Skill.findById(created.body._id).lean()).updatedAt).toEqual(before);
    });

    it('rolls back the publish time when the viewer role is missing', async () => {
      const tested = await createTestedSkill();
      const viewer = await AccessRole.findById(testRoles.viewer._id).lean();
      await AccessRole.deleteOne({ _id: viewer._id });
      try {
        const res = await request(app)
          .post(`/api/skills/${tested._id}/publish`)
          .send({ scope: 'all' });
        expect(res.status).toBe(500);
        expect(res.body.code).toBe('PUBLISH_ACL_FAILED');
        expect((await Skill.findById(tested._id).lean()).publishedAt).toBeUndefined();
        expect(await publicEntry(tested._id)).toBeNull();
      } finally {
        await AccessRole.create(viewer);
      }
    });

    it('rejects the team scope', async () => {
      const tested = await createTestedSkill();
      const res = await request(app)
        .post(`/api/skills/${tested._id}/publish`)
        .send({ scope: 'team' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SCOPE_UNAVAILABLE');
    });

    it('rejects an editor who cannot share', async () => {
      const tested = await createTestedSkill();
      await grantPermission({
        principalType: PrincipalType.USER,
        principalId: testUsers.editor._id,
        resourceType: ResourceType.SKILL,
        resourceId: tested._id,
        accessRoleId: AccessRoleIds.SKILL_EDITOR,
        grantedBy: testUsers.owner._id,
      });
      setTestUser(testUsers.editor);
      const res = await request(app)
        .post(`/api/skills/${tested._id}/publish`)
        .send({ scope: 'all' });
      expect(res.status).toBe(403);
      expect(await publicEntry(tested._id)).toBeNull();
      expect((await Skill.findById(tested._id).lean()).publishedAt).toBeUndefined();
    });

    it('rejects public publishing when the role lacks SHARE_PUBLIC', async () => {
      const tested = await createTestedSkill();
      const { getRoleByName } = require('~/models');
      const permissive = getRoleByName.getMockImplementation();
      getRoleByName.mockImplementation(() => ({
        permissions: { SKILLS: { USE: true, CREATE: true, SHARE: true, SHARE_PUBLIC: false } },
      }));
      try {
        const res = await request(app)
          .post(`/api/skills/${tested._id}/publish`)
          .send({ scope: 'all' });
        expect(res.status).toBe(403);
        expect(await publicEntry(tested._id)).toBeNull();

        const owner = await request(app)
          .post(`/api/skills/${tested._id}/publish`)
          .send({ scope: 'me' });
        expect(owner.status).toBe(200);
      } finally {
        getRoleByName.mockImplementation(permissive);
      }
    });
  });
});
