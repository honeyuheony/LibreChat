const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: async (req, res, next) => {
    const userId = req.get('x-test-user-id');
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { User } = require('~/db/models');
    req.user = await User.findById(userId).lean();
    req.user.id = req.user._id.toString();
    return next();
  },
  requireSameOrigin: jest.requireActual('~/server/middleware/requireSameOrigin'),
}));

let app;
let mongoServer;
let User;
let Session;
let hong;
let lee;
let outsider;

const readCookie = (response, name) => {
  const header = (response.headers['set-cookie'] ?? []).find((value) =>
    value.startsWith(`${name}=`),
  );
  return header?.split(';')[0].slice(name.length + 1);
};

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
  });
  lee = await User.create({
    name: '이협력',
    email: 'lee@example.com',
    department: '교류협력팀',
    provider: 'local',
  });
  outsider = await User.create({
    name: '외부인',
    email: 'outsider@example.com',
    department: '기타팀',
    provider: 'local',
  });

  app = express();
  app.use(express.json());
  app.use('/api/demo', require('./demo'));
  app.use((_req, res) => res.status(404).json({ message: 'Not found' }));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(() => {
  process.env.DEMO_SWITCH_USERS = 'admin@admin.com,lee@example.com';
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

      const read = await request(app).get('/api/demo/switch-user').set('x-test-user-id', hong.id);
      const write = await request(app).post('/api/demo/switch-user').set('x-test-user-id', hong.id);
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
    const read = await request(app).get('/api/demo/switch-user').set('x-test-user-id', outsider.id);
    const write = await request(app)
      .post('/api/demo/switch-user')
      .set('x-test-user-id', outsider.id);

    expect(read.status).toBe(404);
    expect(write.status).toBe(404);
    expect(readCookie(write, 'refreshToken')).toBeUndefined();
  });

  test('GET names the next account in the list', async () => {
    const fromHong = await request(app).get('/api/demo/switch-user').set('x-test-user-id', hong.id);
    const fromLee = await request(app).get('/api/demo/switch-user').set('x-test-user-id', lee.id);

    expect(fromHong.status).toBe(200);
    expect(fromHong.body).toEqual({ target: { name: '이협력', department: '교류협력팀' } });
    expect(fromLee.status).toBe(200);
    expect(fromLee.body).toEqual({ target: { name: '홍길동', department: '정세분석팀' } });
  });

  test('POST issues the target account token and refresh cookie', async () => {
    const response = await request(app)
      .post('/api/demo/switch-user')
      .set('x-test-user-id', hong.id);

    expect(response.status).toBe(200);
    expect(response.body.target).toEqual({ name: '이협력', department: '교류협력팀' });
    expect(jwt.verify(response.body.token, process.env.JWT_SECRET).id).toBe(lee.id);

    const refreshToken = readCookie(response, 'refreshToken');
    expect(jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET).id).toBe(lee.id);
    expect(readCookie(response, 'token_provider')).toBe('librechat');
    expect(await Session.countDocuments({ user: lee._id })).toBe(1);
    expect(await Session.countDocuments({ user: hong._id })).toBe(0);
  });

  test('compare emails without regard to case', async () => {
    process.env.DEMO_SWITCH_USERS = ' Admin@Admin.com , LEE@example.COM ';

    const response = await request(app).post('/api/demo/switch-user').set('x-test-user-id', lee.id);

    expect(response.status).toBe(200);
    expect(jwt.verify(response.body.token, process.env.JWT_SECRET).id).toBe(hong.id);
  });

  test('answer 404 when the target account is not in the database', async () => {
    process.env.DEMO_SWITCH_USERS = 'admin@admin.com,missing@example.com';

    const read = await request(app).get('/api/demo/switch-user').set('x-test-user-id', hong.id);
    const write = await request(app).post('/api/demo/switch-user').set('x-test-user-id', hong.id);

    expect(read.status).toBe(404);
    expect(write.status).toBe(404);
    expect(readCookie(write, 'refreshToken')).toBeUndefined();
  });

  test('answer 404 when the list has no other account', async () => {
    process.env.DEMO_SWITCH_USERS = 'admin@admin.com,ADMIN@admin.com';

    const response = await request(app)
      .post('/api/demo/switch-user')
      .set('x-test-user-id', hong.id);

    expect(response.status).toBe(404);
  });

  test('reject a cross-site POST like the login route', async () => {
    const response = await request(app)
      .post('/api/demo/switch-user')
      .set('x-test-user-id', hong.id)
      .set('Origin', 'https://attacker.example')
      .set('Sec-Fetch-Site', 'cross-site');

    expect(response.status).toBe(403);
    expect(readCookie(response, 'refreshToken')).toBeUndefined();
  });

  test('log who switched to whom', async () => {
    const { logger } = require('@librechat/data-schemas');
    const info = jest.spyOn(logger, 'info');

    await request(app).post('/api/demo/switch-user').set('x-test-user-id', hong.id);

    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('admin@admin.com -> lee@example.com'),
    );
    info.mockRestore();
  });
});
