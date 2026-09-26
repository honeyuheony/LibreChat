const path = require('path');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

const mockActivitySource = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'packages',
  'api',
  'src',
  'connectors',
  'activity.ts',
);

jest.mock('@librechat/api', () => ({
  getDeskRelayConfig: jest.fn(() => ({})),
  createDeskStatusHandler: jest.fn(() => (req, res) => res.json({})),
  createDeskPermissionsHandler: jest.fn(() => (req, res) => res.json([])),
  createDeskAppReleaseHandler: jest.fn(() => (req, res) => res.json({})),
  /** The real handler, without loading the rest of the package. */
  createConnectorActivityHandler:
    jest.requireActual(mockActivitySource).createConnectorActivityHandler,
}));

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, res, next) => {
    req.user = { id: req.headers['x-test-user'] };
    next();
  },
}));

let mongoServer;
let app;
let Message;
let Conversation;

const mcpCall = (name) => ({ type: 'tool_call', tool_call: { id: name, name, args: '{}' } });

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  ({ Message, Conversation } = require('~/db/models'));
  app = express();
  app.use('/api/connectors', require('../connectors'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Message.deleteMany({});
  await Conversation.deleteMany({});
});

async function seedMessage({ user, conversationId, content, createdAt }) {
  await Message.collection.insertOne({
    messageId: `${user}-${conversationId}-${createdAt.getTime()}`,
    conversationId,
    user,
    isCreatedByUser: false,
    content,
    createdAt,
    updatedAt: createdAt,
  });
}

describe('GET /api/connectors/activity', () => {
  it("returns only the signed-in user's connector calls, newest first", async () => {
    await Conversation.collection.insertMany([
      { conversationId: 'convo-a', user: 'user-a', title: '주간 보고' },
      { conversationId: 'convo-b', user: 'user-b', title: '다른 사람 대화' },
    ]);
    await seedMessage({
      user: 'user-a',
      conversationId: 'convo-a',
      content: [mcpCall('list_directory_mcp_filesystem')],
      createdAt: new Date('2026-09-26T01:00:00Z'),
    });
    await seedMessage({
      user: 'user-a',
      conversationId: 'convo-a',
      content: [mcpCall('skill'), mcpCall('gmail_search_mcp_google-workspace')],
      createdAt: new Date('2026-09-26T02:00:00Z'),
    });
    await seedMessage({
      user: 'user-b',
      conversationId: 'convo-b',
      content: [mcpCall('read_file_mcp_filesystem')],
      createdAt: new Date('2026-09-26T03:00:00Z'),
    });

    const res = await request(app).get('/api/connectors/activity').set('x-test-user', 'user-a');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        toolKey: 'gmail_search_mcp_google-workspace',
        count: 1,
        conversationId: 'convo-a',
        conversationTitle: '주간 보고',
        createdAt: '2026-09-26T02:00:00.000Z',
      },
      {
        toolKey: 'list_directory_mcp_filesystem',
        count: 1,
        conversationId: 'convo-a',
        conversationTitle: '주간 보고',
        createdAt: '2026-09-26T01:00:00.000Z',
      },
    ]);
  });

  it('returns an empty list for a user with no connector calls', async () => {
    await seedMessage({
      user: 'user-a',
      conversationId: 'convo-a',
      content: [mcpCall('skill')],
      createdAt: new Date(),
    });

    const res = await request(app).get('/api/connectors/activity').set('x-test-user', 'user-a');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
