import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Model } from 'mongoose';
import type { ITaskExtractionDocument } from '~/schema/taskExtraction';
import type { ITaskSummaryDocument } from '~/schema/taskSummary';
import type { ITaskResultDocument } from '~/schema/taskResult';
import { createModels } from '~/models';

const DB_SETUP_TIMEOUT_MS = 60_000;
let mongoServer: MongoMemoryServer;
let TaskExtraction: Model<ITaskExtractionDocument>;
let TaskSummary: Model<ITaskSummaryDocument>;
let TaskResult: Model<ITaskResultDocument>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  const models = createModels(mongoose);
  TaskExtraction = models.TaskExtraction;
  TaskSummary = models.TaskSummary;
  TaskResult = models.TaskResult;
  await Promise.all([TaskExtraction.init(), TaskSummary.init(), TaskResult.init()]);
}, DB_SETUP_TIMEOUT_MS);

afterEach(async () => {
  await Promise.all([
    TaskExtraction.deleteMany({}),
    TaskSummary.deleteMany({}),
    TaskResult.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, DB_SETUP_TIMEOUT_MS);

describe('task schemas', () => {
  it('stores and retrieves one extraction per user, document, field, and cache version', async () => {
    const user = new mongoose.Types.ObjectId();
    const extraction = {
      user,
      tenantId: 'tenant-1',
      fileId: 'file-1',
      textHash: 'sha256-1',
      field: '정세 전망',
      promptVersion: 'extract-v1',
      model: 'claude-sonnet-5',
      cell: { value: '안정', status: 'ok', evidence: { quote: '안정으로 평가했다.' } },
    } as const;

    await TaskExtraction.create(extraction);
    const cached = await TaskExtraction.findOne({
      user,
      tenantId: 'tenant-1',
      fileId: 'file-1',
      textHash: 'sha256-1',
      field: '정세 전망',
      promptVersion: 'extract-v1',
      model: 'claude-sonnet-5',
    }).lean();

    expect(cached?.cell).toMatchObject({
      value: '안정',
      status: 'ok',
      evidence: { quote: '안정으로 평가했다.' },
    });
    await expect(TaskExtraction.create(extraction)).rejects.toMatchObject({ code: 11000 });
  });

  it('stores and retrieves document summaries using the normalized cache dimensions', async () => {
    const user = new mongoose.Types.ObjectId();
    await TaskSummary.create({
      user,
      tenantId: 'tenant-1',
      fileId: 'file-1',
      textHash: 'sha256-1',
      view: '경제 영향',
      promptVersion: 'summary-v1',
      model: 'claude-sonnet-5',
      summary: '경제 영향이 제한적이다.',
      oneLine: '영향은 제한적이다.',
      points: [{ id: 'point-1', text: '영향은 제한적이다.', quote: '영향은 제한적일 전망이다.' }],
    });

    const cached = await TaskSummary.findOne({
      user,
      tenantId: 'tenant-1',
      fileId: 'file-1',
      textHash: 'sha256-1',
      view: '경제 영향',
      promptVersion: 'summary-v1',
      model: 'claude-sonnet-5',
    }).lean();

    expect(cached).toMatchObject({
      summary: '경제 영향이 제한적이다.',
      oneLine: '영향은 제한적이다.',
      points: [{ id: 'point-1', text: '영향은 제한적이다.', quote: '영향은 제한적일 전망이다.' }],
    });
    expect(await TaskSummary.countDocuments({ view: '다른 관점' })).toBe(0);
  });

  it('stores structured task results and retrieves them by conversation result id', async () => {
    const user = new mongoose.Types.ObjectId();
    const result = {
      kind: 'table' as const,
      resultId: 'result-1',
      conversationId: 'conversation-1',
      title: '문서 비교표',
      fields: ['정세 전망'],
      rows: [
        {
          file_id: 'file-1',
          filename: 'briefing.pdf',
          parse: 'ok' as const,
          cells: [
            {
              value: '안정',
              status: 'ok' as const,
              evidence: { quote: '안정으로 평가했다.', page: 2 },
            },
          ],
        },
      ],
      stats: { docs: 1, reflected: 1, none: 0, low: 0, textOnly: 0, cached: 0, seconds: 1 },
      extractor: { promptVersion: 'extract-v1', model: 'claude-sonnet-5' },
      createdAt: '2026-09-26T00:00:00.000Z',
    };

    await TaskResult.create({
      user,
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      resultId: 'result-1',
      kind: 'table',
      result,
    });
    const stored = await TaskResult.findOne({
      user,
      tenantId: 'tenant-1',
      conversationId: 'conversation-1',
      resultId: 'result-1',
    }).lean();

    expect(stored?.result).toEqual(result);
    expect(stored?.kind).toBe('table');
  });
});
