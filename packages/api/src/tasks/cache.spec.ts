import mongoose from 'mongoose';
import { createModels } from '@librechat/data-schemas';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMongoTaskCache, normalizeKey } from './cache';

let mongoServer: MongoMemoryServer;
let models: ReturnType<typeof createModels>;
const userId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();
const key = { fileId: 'f1', textHash: 'hash-1', promptVersion: 'extract-v1', model: 'm' };

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  models = createModels(mongoose);
  await models.TaskExtraction.init();
  await models.TaskSummary.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await models.TaskExtraction.deleteMany({});
  await models.TaskSummary.deleteMany({});
});

function cacheFor(user: string) {
  return createMongoTaskCache({
    userId: user,
    TaskExtraction: models.TaskExtraction as never,
    TaskSummary: models.TaskSummary as never,
  });
}

describe('createMongoTaskCache', () => {
  it('stores one row per document and field, and overwrites a field on save', async () => {
    const cache = cacheFor(userId);
    await cache.saveCells({
      ...key,
      cells: new Map([
        ['정세 전망', { value: '완화', status: 'ok' as const }],
        ['전월 대비', { value: null, status: 'none' as const }],
      ]),
    });
    await cache.saveCells({
      ...key,
      cells: new Map([['정세 전망', { value: '긴장', status: 'low' as const }]]),
    });
    expect(await models.TaskExtraction.countDocuments({ user: userId })).toBe(2);
    const cells = await cache.getCells({ ...key, fields: ['정세 전망', '전월 대비', '위험도'] });
    expect(Object.fromEntries(cells)).toEqual({
      '정세 전망': { value: '긴장', status: 'low' },
      '전월 대비': { value: null, status: 'none' },
    });
  });

  it('misses when the text hash, model or user differs', async () => {
    await cacheFor(userId).saveCells({
      ...key,
      cells: new Map([['정세 전망', { value: '완화', status: 'ok' as const }]]),
    });
    const fields = ['정세 전망'];
    expect((await cacheFor(userId).getCells({ ...key, textHash: 'hash-2', fields })).size).toBe(0);
    expect((await cacheFor(userId).getCells({ ...key, model: 'other', fields })).size).toBe(0);
    expect((await cacheFor(otherUserId).getCells({ ...key, fields })).size).toBe(0);
  });

  it('round-trips a document summary keyed by the normalized view', async () => {
    const summary = {
      summary: '요약',
      oneLine: '한 줄',
      points: [{ id: 'p1', text: '점', quote: '인용' }],
    };
    await cacheFor(userId).saveSummary({ ...key, view: '위험 요인 중심 ', summary });
    await expect(cacheFor(userId).getSummary({ ...key, view: '위험 요인 중심' })).resolves.toEqual(
      summary,
    );
  });
});

describe('normalizeKey', () => {
  it('does not merge different field names that share words', () => {
    expect(normalizeKey('전망')).not.toBe(normalizeKey('정세 전망'));
  });
});
