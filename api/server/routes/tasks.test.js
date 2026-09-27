const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');

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

// 대역이 아니라 실제 모델 모듈을 쓴다. 경로가 모델을 정의된 곳에서 읽는지 보려는 것이다.
const { Conversation, TaskExtraction, TaskResult } = require('~/db/models');
const router = require('./tasks');
const app = express();
app.use('/api/tasks', router);

describe('task result routes', () => {
  let mockFindTaskResult;
  let mockFindTaskResults;
  let mockFindTaskExtraction;
  let mockFindConversations;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindTaskResult = jest.spyOn(TaskResult, 'findOne');
    mockFindTaskResults = jest.spyOn(TaskResult, 'find');
    mockFindTaskExtraction = jest.spyOn(TaskExtraction, 'find');
    mockFindConversations = jest.spyOn(Conversation, 'find');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('reads the task models from the model module', () => {
    expect(typeof TaskResult.findOne).toBe('function');
    expect(typeof TaskExtraction.find).toBe('function');
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

  describe('results list', () => {
    function createStoredResult(index, overrides = {}) {
      const createdAt = new Date(Date.UTC(2026, 0, 1) - index * 1000);
      const resultId = `result-${index}`;
      const conversationId = `conversation-${index}`;
      return {
        _id: new mongoose.Types.ObjectId(),
        user: 'authenticated-user',
        conversationId,
        resultId,
        kind: 'table',
        result: {
          kind: 'table',
          resultId,
          conversationId,
          title: `결과 ${index}`,
          rows: [{}, {}],
          createdAt: createdAt.toISOString(),
        },
        createdAt,
        ...overrides,
      };
    }

    function createConversation(conversationId, overrides = {}) {
      return { conversationId, title: `대화 ${conversationId}`, ...overrides };
    }

    function createTaskResultQuery(results) {
      return {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(results),
      };
    }

    function createConversationQuery(conversations) {
      return {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(conversations),
      };
    }

    test('only lists results belonging to the authenticated user', async () => {
      const storedResult = createStoredResult(1);
      const anotherUsersResult = createStoredResult(2, { user: 'another-user' });
      const allResults = [storedResult, anotherUsersResult];
      mockFindTaskResults.mockImplementation((filter) =>
        createTaskResultQuery(allResults.filter(({ user }) => user === filter.user)),
      );
      mockFindConversations.mockReturnValue(
        createConversationQuery([createConversation(storedResult.conversationId)]),
      );

      const response = await request(app).get('/api/tasks/results');

      expect(response.status).toBe(200);
      expect(response.body.results).toEqual([
        {
          resultId: storedResult.resultId,
          conversationId: storedResult.conversationId,
          conversationTitle: `대화 ${storedResult.conversationId}`,
          kind: 'table',
          title: '결과 1',
          rows: 2,
          createdAt: storedResult.createdAt.toISOString(),
        },
      ]);
      expect(mockFindTaskResults).toHaveBeenCalledWith({ user: 'authenticated-user' });
    });

    test('includes the report filename in the list item', async () => {
      const reportResult = createStoredResult(4, {
        kind: 'report',
        result: {
          kind: 'report',
          resultId: 'result-4',
          conversationId: 'conversation-4',
          title: '월간 보고서',
          body: '보고서 내용',
          file: { file_id: 'file-4', filename: '월간보고서.hwpx' },
        },
      });
      mockFindTaskResults.mockReturnValue(createTaskResultQuery([reportResult]));
      mockFindConversations.mockReturnValue(
        createConversationQuery([createConversation(reportResult.conversationId)]),
      );

      const response = await request(app).get('/api/tasks/results');

      expect(response.status).toBe(200);
      expect(response.body.results[0]).toEqual(
        expect.objectContaining({
          kind: 'report',
          title: '월간 보고서',
          fileName: '월간보고서.hwpx',
        }),
      );
      expect(response.body.results[0]).not.toHaveProperty('rows');
    });

    test('adds the index used for cross-conversation result ordering', () => {
      expect(TaskResult.schema.indexes().map(([keys]) => keys)).toContainEqual({
        user: 1,
        tenantId: 1,
        createdAt: -1,
      });
    });

    test('omits results from archived conversations', async () => {
      const archivedResult = createStoredResult(2);
      const taskResultQuery = createTaskResultQuery([archivedResult]);
      mockFindTaskResults.mockReturnValue(taskResultQuery);
      mockFindConversations.mockReturnValue(createConversationQuery([]));

      const response = await request(app).get('/api/tasks/results');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ results: [], nextCursor: null });
      expect(mockFindConversations).toHaveBeenCalledWith({
        user: 'authenticated-user',
        conversationId: { $in: [archivedResult.conversationId] },
        isArchived: { $ne: true },
      });
    });

    test('omits results whose conversations were deleted', async () => {
      const deletedResult = createStoredResult(3);
      mockFindTaskResults.mockReturnValue(createTaskResultQuery([deletedResult]));
      mockFindConversations.mockReturnValue(createConversationQuery([]));

      const response = await request(app).get('/api/tasks/results');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ results: [], nextCursor: null });
    });

    test('limits pages to 50 results and uses the cursor for the next page', async () => {
      const sameCreatedAt = new Date(Date.UTC(2026, 0, 1));
      const firstPage = Array.from({ length: 51 }, (_, index) => createStoredResult(index))
        .map((taskResult) => ({ ...taskResult, createdAt: sameCreatedAt }))
        .sort((left, right) => String(right._id).localeCompare(String(left._id)));
      const secondPage = [firstPage[50]];
      const firstQuery = createTaskResultQuery(firstPage);
      const secondQuery = createTaskResultQuery(secondPage);
      mockFindTaskResults.mockReturnValueOnce(firstQuery).mockReturnValueOnce(secondQuery);
      mockFindConversations
        .mockReturnValueOnce(
          createConversationQuery(
            firstPage.map(({ conversationId }) => createConversation(conversationId)),
          ),
        )
        .mockReturnValueOnce(
          createConversationQuery(
            secondPage.map(({ conversationId }) => createConversation(conversationId)),
          ),
        );

      const firstResponse = await request(app).get('/api/tasks/results');
      const nextCursor = firstResponse.body.nextCursor;
      const cursorData = JSON.parse(Buffer.from(nextCursor, 'base64url').toString());
      const secondResponse = await request(app)
        .get('/api/tasks/results')
        .query({ cursor: nextCursor });

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.results).toHaveLength(50);
      expect(firstResponse.body.results[49].resultId).toBe(firstPage[49].resultId);
      expect(firstQuery.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      expect(firstQuery.limit).toHaveBeenCalledWith(51);
      expect(cursorData).toEqual({
        createdAt: firstPage[49].createdAt.toISOString(),
        id: String(firstPage[49]._id),
      });
      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body.results).toHaveLength(1);
      expect(secondResponse.body.nextCursor).toBeNull();
      expect(mockFindTaskResults).toHaveBeenNthCalledWith(2, {
        user: 'authenticated-user',
        $or: [
          { createdAt: { $lt: new Date(cursorData.createdAt) } },
          {
            createdAt: new Date(cursorData.createdAt),
            _id: { $lt: new mongoose.Types.ObjectId(cursorData.id) },
          },
        ],
      });
    });

    test('rejects a malformed cursor with 400', async () => {
      const response = await request(app).get('/api/tasks/results').query({ cursor: 'invalid' });

      expect(response.status).toBe(400);
      expect(mockFindTaskResults).not.toHaveBeenCalled();
    });
  });
});
