const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels } = require('@librechat/data-schemas');
const { MAX_USER_INSTRUCTIONS_LENGTH } = require('librechat-data-provider');

/** Loads the caller's user document per request, the way the JWT strategy does. */
jest.mock('~/server/middleware', () => {
  const pass = (req, res, next) => next();
  return {
    requireJwtAuth: async (req, res, next) => {
      const { models } = require('mongoose');
      const user = await models.User.findById(req.headers['x-test-user']).lean();
      if (!user) {
        return res.status(401).end();
      }
      req.user = { ...user, id: user._id.toString() };
      next();
    },
    canDeleteAccount: pass,
    configMiddleware: pass,
    verifyEmailLimiter: pass,
    verifyEmailSubmissionLimiter: pass,
  };
});

jest.mock('./settings', () => {
  const express = require('express');
  return express.Router();
});

let mongoServer;
let app;
let alice;
let bob;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  const userRouter = require('./user');
  app = express();
  app.use(express.json());
  app.use('/api/user', userRouter);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  const { User } = mongoose.models;
  await User.deleteMany({});
  alice = await User.create({ email: 'alice@example.com', provider: 'local' });
  bob = await User.create({ email: 'bob@example.com', provider: 'local' });
});

const patchAs = (user, body) =>
  request(app)
    .patch('/api/user/preferences/workspace')
    .set('x-test-user', user._id.toString())
    .send(body);

const getAs = (user) =>
  request(app).get('/api/user/preferences/workspace').set('x-test-user', user._id.toString());

describe('/api/user/preferences/workspace', () => {
  it('saves the workspace preferences and reads them back', async () => {
    const saved = await patchAs(alice, {
      instructions: '답변은 한국어.',
      approvalMode: 'auto',
    }).expect(200);
    expect(saved.body).toEqual({
      updated: true,
      preferences: { instructions: '답변은 한국어.', approvalMode: 'auto' },
    });

    const read = await getAs(alice).expect(200);
    expect(read.body).toEqual({ instructions: '답변은 한국어.', approvalMode: 'auto' });
  });

  it('reads defaults before anything is saved', async () => {
    const read = await getAs(alice).expect(200);
    expect(read.body).toEqual({ instructions: '', approvalMode: 'manual' });
  });

  it('keeps one user workspace preferences out of another user reads and writes', async () => {
    await patchAs(alice, { instructions: 'Alice only', approvalMode: 'auto' }).expect(200);

    const bobRead = await getAs(bob).expect(200);
    expect(bobRead.body).toEqual({ instructions: '', approvalMode: 'manual' });

    await patchAs(bob, { instructions: 'Bob only' }).expect(200);
    const aliceRead = await getAs(alice).expect(200);
    expect(aliceRead.body).toEqual({ instructions: 'Alice only', approvalMode: 'auto' });
  });

  it.each([
    ['instructions over the limit', { instructions: 'a'.repeat(MAX_USER_INSTRUCTIONS_LENGTH + 1) }],
    ['an approval mode outside the allowed values', { approvalMode: 'always' }],
    ['no workspace field', {}],
  ])('rejects workspace preferences with %s and stores nothing', async (_label, body) => {
    await patchAs(alice, body).expect(400);

    const stored = await mongoose.models.User.findById(alice._id).lean();
    expect(stored.personalization?.instructions).toBeUndefined();
    expect(stored.personalization?.approvalMode).toBeUndefined();
  });
});
