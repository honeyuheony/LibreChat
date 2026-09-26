const express = require('express');
const request = require('supertest');

const mockFindTaskResult = jest.fn();
const mockFindTaskExtraction = jest.fn();

jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => {
    req.user = { id: 'authenticated-user' };
    next();
  },
}));

jest.mock('~/db', () => ({
  TaskResult: { findOne: (...args) => mockFindTaskResult(...args) },
  TaskExtraction: { find: (...args) => mockFindTaskExtraction(...args) },
}));

jest.mock('~/models', () => ({
  getFiles: jest.fn(),
  getMessages: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  buildTaskWorkbook: jest.fn(),
  estimateTask: jest.fn(),
  EXTRACT_PROMPT_VERSION: 'extract-v1',
  normalizeKey: (value) => value.normalize('NFKC').trim(),
  loadConversationDocuments: jest.fn(),
}));

const router = require('./tasks');
const app = express();
app.use('/api/tasks', router);

describe('task result routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not return a result owned by another user', async () => {
    mockFindTaskResult.mockReturnValue({ lean: async () => null });

    const response = await request(app).get('/api/tasks/results/another-users-result');

    expect(response.status).toBe(404);
    expect(mockFindTaskResult).toHaveBeenCalledWith({
      user: 'authenticated-user',
      resultId: 'another-users-result',
    });
  });

  test('returns only the authenticated user result', async () => {
    const storedResult = {
      resultId: 'owned-result',
      user: 'authenticated-user',
      result: { kind: 'summary', resultId: 'owned-result', body: '내용' },
    };
    mockFindTaskResult.mockReturnValue({ lean: async () => storedResult });

    const response = await request(app).get('/api/tasks/results/owned-result');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(storedResult.result);
    expect(mockFindTaskResult).toHaveBeenCalledWith({
      user: 'authenticated-user',
      resultId: 'owned-result',
    });
  });
});
