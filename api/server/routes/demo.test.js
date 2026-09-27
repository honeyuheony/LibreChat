const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { SystemRoles, ViolationTypes } = require('librechat-data-provider');

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

const SWITCH_ORIGIN_COOKIE = 'demo_switch_origin';

let app;
let mongoServer;
let User;
let Session;
let hong;
let lee;
let guarded;
let outsider;

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

  app = express();
  app.use(express.json());
  /** checkBan assigns req.ip; plain CJS ignores the getter-only write, Jest's strict transform throws. */
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
