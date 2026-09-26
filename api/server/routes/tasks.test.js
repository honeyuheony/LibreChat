const express = require('express');
const request = require('supertest');

const mockFindTaskResult = jest.fn();
const mockFindTaskExtraction = jest.fn();
const mockGetAgent = jest.fn();
const mockGetConvo = jest.fn();
const mockLoadConversationDocuments = jest.fn();
const mockEstimateTask = jest.fn();

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
  getAgent: (...args) => mockGetAgent(...args),
  getConvo: (...args) => mockGetConvo(...args),
  getFiles: jest.fn(),
  getMessages: jest.fn(),
}));

jest.mock('@librechat/api', () => ({
  buildTaskWorkbook: jest.fn(),
  estimateTask: (...args) => mockEstimateTask(...args),
  EXTRACT_PROMPT_VERSION: 'extract-v1',
  normalizeKey: (value) => value.normalize('NFKC').trim(),
  loadConversationDocuments: (...args) => mockLoadConversationDocuments(...args),
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

  test('estimates cache hits for the conversation agent model', async () => {
    mockLoadConversationDocuments.mockResolvedValue([
      { file_id: 'file-1', filename: '자료.pdf', text: '본문', textHash: 'hash-1', parse: 'ok' },
    ]);
    mockGetConvo.mockResolvedValue({ agent_id: 'agent-1', model: 'conversation-model' });
    mockGetAgent.mockResolvedValue({
      model: 'agent-model',
      model_parameters: { model: 'selected-model' },
    });
    mockFindTaskResult.mockReturnValue({ sort: () => ({ lean: async () => null }) });
    mockFindTaskExtraction.mockReturnValue({
      select: () => ({
        lean: async () => [{ fileId: 'file-1', textHash: 'hash-1', field: '항목' }],
      }),
    });
    mockEstimateTask.mockReturnValue({
      docs: 1,
      cached: 1,
      minutes: { min: 0, max: 0 },
      allCached: true,
    });

    const response = await request(app)
      .get('/api/tasks/estimate')
      .query({ conversationId: 'conversation-1', kind: 'table', fields: ['항목'] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      docs: 1,
      cached: 1,
      minutes: { min: 0, max: 0 },
      allCached: true,
    });
    expect(mockGetAgent).toHaveBeenCalledWith({ id: 'agent-1' });
    expect(mockFindTaskExtraction).toHaveBeenCalledWith({
      user: 'authenticated-user',
      fileId: { $in: ['file-1'] },
      field: { $in: ['항목'] },
      promptVersion: 'extract-v1',
      model: 'selected-model',
    });
  });
});
