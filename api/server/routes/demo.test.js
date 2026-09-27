const os = require('os');
const fs = require('fs');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { SystemRoles, ViolationTypes, CacheKeys } = require('librechat-data-provider');
const { setCachedAuthUserDoc, getCachedAuthUserDoc } = require('@librechat/api');
const { createDemoData, DEFAULT_AGENT_ID } = require(
  path.resolve(__dirname, '..', '..', '..', 'config', 'demo-data'),
);

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: async (req, res, next) => {
    const bearer = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!bearer) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { id } = require('jsonwebtoken').verify(bearer, process.env.JWT_SECRET);
    const { User } = require('~/db/models');
    req.user = await User.findById(id).lean();
    req.user.id = req.user._id.toString();
    return next();
  },
  requireSameOrigin: jest.requireActual('~/server/middleware/requireSameOrigin'),
  checkBan: jest.requireActual('~/server/middleware/checkBan'),
}));

const mockMeiliIndexes = new Map();
jest.mock('meilisearch', () => ({
  MeiliSearch: jest.fn().mockImplementation(() => ({
    index: (uid) => {
      if (!mockMeiliIndexes.has(uid)) {
        mockMeiliIndexes.set(uid, { deleteDocuments: jest.fn(async () => ({ taskUid: 1 })) });
      }
      return mockMeiliIndexes.get(uid);
    },
    waitForTask: async () => ({ status: 'succeeded' }),
  })),
}));

const SWITCH_ORIGIN_COOKIE = 'demo_switch_origin';

let app;
let mongoServer;
let User;
let Session;
let hong;
let lee;
let guarded;
let outsider;
let demo;
let otherAdmin;

const readCookie = (response, name) => {
  const header = (response.headers['set-cookie'] ?? []).find((value) =>
    value.startsWith(`${name}=`),
  );
  return header?.split(';')[0].slice(name.length + 1);
};

const loginAs = (user) => `Bearer ${jwt.sign({ id: user.id }, process.env.JWT_SECRET)}`;

const signedIdOf = (token) => jwt.verify(token, process.env.JWT_SECRET).id;

beforeAll(async () => {
  process.env.JWT_SECRET = 'demo-test-jwt-secret';
  process.env.JWT_REFRESH_SECRET = 'demo-test-jwt-refresh-secret';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  ({ User, Session } = require('~/db/models'));
  hong = await User.create({
    name: '홍길동',
    email: 'admin@admin.com',
    department: '정세분석팀',
    provider: 'local',
    role: SystemRoles.ADMIN,
  });
  lee = await User.create({
    name: '이협력',
    email: 'lee@example.com',
    department: '교류협력팀',
    provider: 'local',
    role: SystemRoles.USER,
  });
  guarded = await User.create({
    name: '보안팀',
    email: 'guarded@example.com',
    department: '보안팀',
    provider: 'local',
    role: SystemRoles.USER,
    twoFactorEnabled: true,
  });
  outsider = await User.create({
    name: '외부인',
    email: 'outsider@example.com',
    department: '기타팀',
    provider: 'local',
    role: SystemRoles.USER,
  });

  demo = await User.create({
    name: '데모',
    email: 'demo@example.com',
    department: '데모팀',
    provider: 'local',
    role: SystemRoles.USER,
  });
  otherAdmin = await User.create({
    name: '다른관리자',
    email: 'other-admin@example.com',
    department: '운영팀',
    provider: 'local',
    role: SystemRoles.ADMIN,
  });

  app = express();
  app.use(express.json());
  /** checkBan 이 req.ip 에 값을 넣는데, getter 뿐인 속성에 쓰면 일반 CJS 는 무시하지만 Jest 의 strict 변환은 예외를 던진다. */
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'ip', { value: req.ip, writable: true, configurable: true });
    next();
  });
  app.use('/api/demo', require('./demo'));
  app.use((_req, res) => res.status(404).json({ message: 'Not found' }));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  process.env.DEMO_SWITCH_USERS = 'admin@admin.com,lee@example.com';
  await Session.deleteMany({});
});

afterEach(() => {
  delete process.env.DEMO_SWITCH_USERS;
});

describe('demo switch-user routes', () => {
  test.each([undefined, '', ' , '])(
    'are not attached when DEMO_SWITCH_USERS is %p',
    async (value) => {
      if (value === undefined) {
        delete process.env.DEMO_SWITCH_USERS;
      } else {
        process.env.DEMO_SWITCH_USERS = value;
      }

      const read = await request(app)
        .get('/api/demo/switch-user')
        .set('authorization', loginAs(hong));
      const write = await request(app)
        .post('/api/demo/switch-user')
        .set('authorization', loginAs(hong));
      const anonymous = await request(app).get('/api/demo/switch-user');

      expect(read.status).toBe(404);
      expect(write.status).toBe(404);
      expect(readCookie(write, 'refreshToken')).toBeUndefined();
      expect(anonymous.status).toBe(404);
    },
  );

  test('require authentication', async () => {
    const read = await request(app).get('/api/demo/switch-user');
    const write = await request(app).post('/api/demo/switch-user');

    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
  });

  test('hide themselves from a user outside the list', async () => {
    const read = await request(app)
      .get('/api/demo/switch-user')
      .set('authorization', loginAs(outsider));
    const write = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(outsider));

    expect(read.status).toBe(404);
    expect(write.status).toBe(404);
    expect(readCookie(write, 'refreshToken')).toBeUndefined();
  });

  test('GET names the next account for an admin', async () => {
    const response = await request(app)
      .get('/api/demo/switch-user')
      .set('authorization', loginAs(hong));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ target: { name: '이협력', department: '교류협력팀' } });
  });

  test('POST from an admin issues the target account token and refresh cookie', async () => {
    const response = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(hong));

    expect(response.status).toBe(200);
    expect(response.body.target).toEqual({ name: '이협력', department: '교류협력팀' });
    expect(signedIdOf(response.body.token)).toBe(lee.id);

    const refreshToken = readCookie(response, 'refreshToken');
    expect(jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET).id).toBe(lee.id);
    expect(readCookie(response, 'token_provider')).toBe('librechat');
    expect(await Session.countDocuments({ user: lee._id })).toBe(1);
  });

  test('a user who logged in directly cannot switch to an admin', async () => {
    const read = await request(app).get('/api/demo/switch-user').set('authorization', loginAs(lee));
    const write = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(lee));

    expect(read.status).toBe(404);
    expect(write.status).toBe(403);
    expect(readCookie(write, 'refreshToken')).toBeUndefined();
    expect(await Session.countDocuments({ user: hong._id })).toBe(0);
  });

  test('a session switched from the admin can return to it and switch again', async () => {
    const browser = request.agent(app);

    const toLee = await browser.post('/api/demo/switch-user').set('authorization', loginAs(hong));
    expect(toLee.status).toBe(200);
    expect(readCookie(toLee, SWITCH_ORIGIN_COOKIE)).toBeTruthy();

    const leeToken = `Bearer ${toLee.body.token}`;
    const menu = await browser.get('/api/demo/switch-user').set('authorization', leeToken);
    expect(menu.status).toBe(200);
    expect(menu.body).toEqual({ target: { name: '홍길동', department: '정세분석팀' } });

    const back = await browser.post('/api/demo/switch-user').set('authorization', leeToken);
    expect(back.status).toBe(200);
    expect(signedIdOf(back.body.token)).toBe(hong.id);
    expect(readCookie(back, SWITCH_ORIGIN_COOKIE)).toBe('');

    const again = await browser
      .post('/api/demo/switch-user')
      .set('authorization', `Bearer ${back.body.token}`);
    expect(again.status).toBe(200);
    expect(signedIdOf(again.body.token)).toBe(lee.id);
  });

  test('a forged switch marker is rejected', async () => {
    const forged = jwt.sign({ from: hong.id, to: lee.id }, 'attacker-guessed-secret', {
      audience: 'librechat-demo-switch',
    });
    const unsigned = jwt.sign({ from: hong.id, to: lee.id }, process.env.JWT_SECRET);

    const withForged = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(lee))
      .set('Cookie', `${SWITCH_ORIGIN_COOKIE}=${forged}`);
    const withWrongAudience = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(lee))
      .set('Cookie', `${SWITCH_ORIGIN_COOKIE}=${unsigned}`);

    expect(withForged.status).toBe(403);
    expect(withWrongAudience.status).toBe(403);
    expect(readCookie(withForged, 'refreshToken')).toBeUndefined();
  });

  test('a marker issued to another user cannot open the admin', async () => {
    const stolen = jwt.sign({ from: hong.id, to: guarded.id }, process.env.JWT_SECRET, {
      audience: 'librechat-demo-switch',
    });

    const response = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(lee))
      .set('Cookie', `${SWITCH_ORIGIN_COOKIE}=${stolen}`);

    expect(response.status).toBe(403);
  });

  test('switching deletes the previous refresh session', async () => {
    const { createSession } = require('~/models');
    const { refreshToken } = await createSession(hong._id);
    expect(await Session.countDocuments({ user: hong._id })).toBe(1);

    const response = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(hong))
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(response.status).toBe(200);
    expect(await Session.countDocuments({ user: hong._id })).toBe(0);
    expect(await Session.countDocuments({ user: lee._id })).toBe(1);
  });

  test('switching without a refresh cookie leaves other sessions alone', async () => {
    const { createSession } = require('~/models');
    await createSession(hong._id);

    const response = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(hong));

    expect(response.status).toBe(200);
    expect(await Session.countDocuments({ user: hong._id })).toBe(1);
  });

  test('a banned user gets the ban response', async () => {
    const { getLogStores } = require('~/cache');
    const banLogs = getLogStores(ViolationTypes.BAN);
    process.env.BAN_VIOLATIONS = 'true';
    await banLogs.set(hong.id, { type: ViolationTypes.BAN, expiresAt: Date.now() + 60_000 });

    try {
      const response = await request(app)
        .post('/api/demo/switch-user')
        .set('authorization', loginAs(hong));

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/banned/);
      expect(readCookie(response, 'refreshToken')).toBeUndefined();
    } finally {
      delete process.env.BAN_VIOLATIONS;
      await banLogs.delete(hong.id);
    }
  });

  test('a target with two-factor authentication is not switched to', async () => {
    process.env.DEMO_SWITCH_USERS = 'admin@admin.com,guarded@example.com';

    const read = await request(app)
      .get('/api/demo/switch-user')
      .set('authorization', loginAs(hong));
    const write = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(hong));

    expect(read.status).toBe(404);
    expect(write.status).toBe(403);
    expect(readCookie(write, 'refreshToken')).toBeUndefined();
  });

  test('compare emails without regard to case', async () => {
    process.env.DEMO_SWITCH_USERS = ' Admin@Admin.com , LEE@example.COM ';

    const response = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(hong));

    expect(response.status).toBe(200);
    expect(signedIdOf(response.body.token)).toBe(lee.id);
  });

  test('answer 404 when the target account is not in the database', async () => {
    process.env.DEMO_SWITCH_USERS = 'admin@admin.com,missing@example.com';

    const read = await request(app)
      .get('/api/demo/switch-user')
      .set('authorization', loginAs(hong));
    const write = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(hong));

    expect(read.status).toBe(404);
    expect(write.status).toBe(404);
    expect(readCookie(write, 'refreshToken')).toBeUndefined();
  });

  test('answer 404 when the list has no other account', async () => {
    process.env.DEMO_SWITCH_USERS = 'admin@admin.com,ADMIN@admin.com';

    const response = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(hong));

    expect(response.status).toBe(404);
  });

  test('reject a cross-site POST like the login route', async () => {
    const response = await request(app)
      .post('/api/demo/switch-user')
      .set('authorization', loginAs(hong))
      .set('Origin', 'https://attacker.example')
      .set('Sec-Fetch-Site', 'cross-site');

    expect(response.status).toBe(403);
    expect(readCookie(response, 'refreshToken')).toBeUndefined();
  });

  test('log who switched to whom', async () => {
    const { logger } = require('@librechat/data-schemas');
    const info = jest.spyOn(logger, 'info');

    await request(app).post('/api/demo/switch-user').set('authorization', loginAs(hong));

    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('admin@admin.com -> lee@example.com'),
    );
    info.mockRestore();
  });
});

describe('demo reset route', () => {
  let baselineDir;

  const raw = (name) => mongoose.connection.db.collection(name);

  const makeConvo = (user, conversationId, title) => ({
    _id: new mongoose.Types.ObjectId(),
    conversationId,
    user: user.id,
    title,
    endpoint: 'agents',
  });

  const makeTextFile = (user, fileId) => ({
    _id: new mongoose.Types.ObjectId(),
    user: user._id,
    file_id: fileId,
    filename: `${fileId}.txt`,
    filepath: `/uploads/${fileId}.txt`,
    type: 'text/plain',
    bytes: 1,
    object: 'file',
    usage: 0,
    source: 'text',
  });

  const protectedState = async () => {
    const ids = [hong._id, demo._id];
    const owners = [...ids, ...ids.map(String)];
    return {
      users: await raw('users')
        .find({ _id: { $in: ids } })
        .sort({ _id: 1 })
        .toArray(),
      conversations: await raw('conversations')
        .find({ user: { $in: owners } })
        .sort({ _id: 1 })
        .toArray(),
    };
  };

  const resetAs = (user) =>
    request(app).post('/api/demo/reset').set('authorization', loginAs(user));

  beforeEach(async () => {
    await Promise.all(
      ['conversations', 'files', 'agents', 'deploymentskillusages'].map((name) =>
        raw(name).deleteMany({}),
      ),
    );
    await raw('conversations').insertMany([
      makeConvo(lee, 'lee-convo-1', '이협력 시나리오'),
      makeConvo(hong, 'hong-convo-1', '관리자 시나리오'),
      makeConvo(demo, 'demo-convo-1', '데모 시나리오'),
    ]);
    await raw('agents').insertOne({
      _id: new mongoose.Types.ObjectId(),
      id: DEFAULT_AGENT_ID,
      name: '업무 도우미',
      author: hong._id,
      instructions: '기준 지시문',
      tools: ['a'],
      provider: 'openAI',
      model: 'gpt',
    });

    baselineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-reset-route-'));
    await createDemoData(mongoose).exportBaseline({
      dir: baselineDir,
      emails: ['lee@example.com'],
      includeShared: true,
      warn: () => undefined,
    });
    process.env.DEMO_BASELINE_DIR = baselineDir;
    process.env.DEMO_SWITCH_USERS = 'admin@admin.com,lee@example.com,other-admin@example.com';
  });

  afterEach(() => {
    delete process.env.DEMO_BASELINE_DIR;
    fs.rmSync(baselineDir, { recursive: true, force: true });
  });

  test('is not attached when DEMO_SWITCH_USERS is empty', async () => {
    delete process.env.DEMO_SWITCH_USERS;

    const response = await resetAs(hong);

    expect(response.status).toBe(404);
  });

  test('requires authentication', async () => {
    const response = await request(app).post('/api/demo/reset');

    expect(response.status).toBe(401);
  });

  test('refuses a listed user who is not an admin', async () => {
    const response = await resetAs(lee);

    expect(response.status).toBe(403);
  });

  test('refuses an admin outside the list', async () => {
    process.env.DEMO_SWITCH_USERS = 'admin@admin.com,lee@example.com';

    const response = await resetAs(otherAdmin);

    expect(response.status).toBe(403);
  });

  test('refuses a user outside the list who is not an admin', async () => {
    const response = await resetAs(outsider);

    expect(response.status).toBe(403);
  });

  test('restores only the non-protected listed accounts, leaving shared data alone', async () => {
    await raw('conversations').insertMany([
      makeConvo(lee, 'lee-convo-2', '이협력 새 대화'),
      makeConvo(hong, 'hong-convo-2', '관리자 새 대화'),
      makeConvo(demo, 'demo-convo-2', '데모 새 대화'),
    ]);
    await raw('conversations').updateOne(
      { conversationId: 'lee-convo-1' },
      { $set: { title: '바뀐 제목' } },
    );
    await raw('files').insertOne(makeTextFile(lee, 'lee-file-new'));
    await raw('users').updateOne({ _id: lee._id }, { $set: { department: '바뀐 부서' } });
    await raw('users').updateOne({ _id: hong._id }, { $set: { organization: '관리자 기관' } });
    await raw('agents').updateOne(
      { id: DEFAULT_AGENT_ID },
      { $set: { instructions: '바뀐 지시문', tools: ['a', 'b'] } },
    );
    const protectedBefore = await protectedState();

    const response = await request(app)
      .post('/api/demo/reset')
      .set('authorization', loginAs(hong))
      .send({ emails: ['admin@admin.com', 'demo@example.com'], includeShared: true });

    expect(response.status).toBe(200);
    expect(response.body.rows.length).toBeGreaterThan(0);
    expect(response.body.rows.every((row) => row.email === 'lee@example.com')).toBe(true);
    expect(response.body.rows).toContainEqual(
      expect.objectContaining({ collection: 'conversations', deleted: 1, replaced: 1 }),
    );

    const leeConvos = await raw('conversations')
      .find({ user: lee.id })
      .sort({ conversationId: 1 })
      .toArray();
    expect(leeConvos.map((c) => [c.conversationId, c.title])).toEqual([
      ['lee-convo-1', '이협력 시나리오'],
    ]);
    expect(await raw('files').countDocuments({ user: lee._id })).toBe(0);
    expect((await raw('users').findOne({ _id: lee._id })).department).toBe('교류협력팀');

    expect(await protectedState()).toEqual(protectedBefore);
    const agent = await raw('agents').findOne({ id: DEFAULT_AGENT_ID });
    expect(agent.instructions).toBe('바뀐 지시문');
    expect(agent.tools).toEqual(['a', 'b']);
  });

  test('drops the cached auth user document of a reset account', async () => {
    const store = require('~/cache').getLogStores(CacheKeys.AUTH_USER_DOC);
    const leeDoc = await User.findById(lee._id).lean();
    await setCachedAuthUserDoc(store, 'lee-cache-key', { ...leeDoc, id: lee.id });
    expect(await getCachedAuthUserDoc(store, 'lee-cache-key')).toBeDefined();

    const response = await resetAs(hong);

    expect(response.status).toBe(200);
    expect(await getCachedAuthUserDoc(store, 'lee-cache-key')).toBeUndefined();
  });

  test('keeps a file id another account also holds, with its agent references', async () => {
    const { logger } = require('@librechat/data-schemas');
    const warn = jest.spyOn(logger, 'warn');
    await raw('files').insertMany([
      makeTextFile(lee, 'shared-file-id'),
      makeTextFile(hong, 'shared-file-id'),
      makeTextFile(lee, 'lee-only-file'),
    ]);
    await raw('agents').updateOne(
      { id: DEFAULT_AGENT_ID },
      { $set: { tool_resources: { file_search: { file_ids: ['shared-file-id'] } } } },
    );

    const response = await resetAs(hong);

    expect(response.status).toBe(200);
    const hongFiles = await raw('files').find({ user: hong._id }).toArray();
    expect(hongFiles.map((file) => file.file_id)).toEqual(['shared-file-id']);
    const leeFiles = await raw('files').find({ user: lee._id }).toArray();
    expect(leeFiles.map((file) => file.file_id)).toEqual(['shared-file-id']);
    const agent = await raw('agents').findOne({ id: DEFAULT_AGENT_ID });
    expect(agent.tool_resources.file_search.file_ids).toEqual(['shared-file-id']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('shared-file-id'));
    warn.mockRestore();
  });

  test('answers 200 with a warning when clearing the auth cache fails after the reset', async () => {
    const { logger } = require('@librechat/data-schemas');
    const warn = jest.spyOn(logger, 'warn');
    const findOne = User.findOne;
    const lookup = jest.spyOn(User, 'findOne').mockImplementation(function (filter, ...rest) {
      if (JSON.stringify(filter ?? {}).includes('lee@example.com')) {
        throw new Error('lookup failed');
      }
      return findOne.call(this, filter, ...rest);
    });
    await raw('conversations').insertOne(makeConvo(lee, 'lee-convo-2', '이협력 새 대화'));

    try {
      const response = await resetAs(hong);

      expect(response.status).toBe(200);
      expect(response.body.rows.length).toBeGreaterThan(0);
      expect(await raw('conversations').countDocuments({ user: lee.id })).toBe(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[demo]'),
        expect.objectContaining({ message: 'lookup failed' }),
      );
    } finally {
      lookup.mockRestore();
      warn.mockRestore();
    }
  });

  test('answers 409 when the list names only protected accounts', async () => {
    process.env.DEMO_SWITCH_USERS = 'admin@admin.com,demo@example.com';

    const response = await resetAs(hong);

    expect(response.status).toBe(409);
    expect(await raw('conversations').countDocuments({})).toBe(3);
  });

  test('answers 500 and logs when the baseline folder is missing', async () => {
    const { logger } = require('@librechat/data-schemas');
    const error = jest.spyOn(logger, 'error');
    process.env.DEMO_BASELINE_DIR = path.join(baselineDir, 'missing');

    const response = await resetAs(hong);

    expect(response.status).toBe(500);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('[demo]'), expect.any(Error));
    error.mockRestore();
  });

  test('refuses a second reset while one is running', async () => {
    const [first, second] = await Promise.all([resetAs(hong), resetAs(hong)]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);

    const after = await resetAs(hong);
    expect(after.status).toBe(200);
  });

  describe('with search on', () => {
    const searchEnv = { SEARCH: 'true', MEILI_HOST: 'http://meili:7700', MEILI_MASTER_KEY: 'k' };

    beforeEach(() => {
      Object.assign(process.env, searchEnv);
      mockMeiliIndexes.clear();
    });

    afterEach(() => {
      Object.keys(searchEnv).forEach((key) => delete process.env[key]);
    });

    test('removes only the reset account documents from the search index by user', async () => {
      await raw('conversations').insertOne(makeConvo(lee, 'lee-convo-2', '이협력 새 대화'));

      const response = await resetAs(hong);

      expect(response.status).toBe(200);
      expect(mockMeiliIndexes.get('convos').deleteDocuments.mock.calls).toEqual([
        [{ filter: `user = "${lee.id}"` }],
      ]);
      const restored = await raw('conversations').findOne({ conversationId: 'lee-convo-1' });
      expect(restored._meiliIndex).toBe(false);
    });

    test('leaves the search index alone when search is off', async () => {
      delete process.env.SEARCH;

      const response = await resetAs(hong);

      expect(response.status).toBe(200);
      const deletions = [...mockMeiliIndexes.values()].flatMap(
        (index) => index.deleteDocuments.mock.calls,
      );
      expect(deletions).toEqual([]);
    });
  });

  test('rejects a cross-site POST', async () => {
    await raw('conversations').insertOne(makeConvo(lee, 'lee-convo-2', '이협력 새 대화'));

    const response = await resetAs(hong)
      .set('Origin', 'https://attacker.example')
      .set('Sec-Fetch-Site', 'cross-site');

    expect(response.status).toBe(403);
    expect(await raw('conversations').countDocuments({ user: lee.id })).toBe(2);
  });
});
