import type { TaskCell } from 'librechat-data-provider';
import type { Model } from 'mongoose';

/** 추출 prompt 나 출력 형식이 바뀌면 올린다. 그러면 예전 행은 더 이상 맞지 않는다. */
export const EXTRACT_PROMPT_VERSION = 'extract-v2';
/** 문서별 요약 prompt 나 출력 형식이 바뀌면 올린다. */
export const SUMMARY_PROMPT_VERSION = 'summary-v1';

/** 앞뒤 공백 제거와 NFKC(전각 → 반각)만 한다. 「전망」과 「정세 전망」은 다른 이름으로 남는다. */
export function normalizeKey(name: string): string {
  return name.normalize('NFKC').trim();
}

export interface CachedSummaryPoint {
  id: string;
  text: string;
  quote: string;
}

export interface CachedSummary {
  summary: string;
  oneLine: string;
  points: CachedSummaryPoint[];
}

interface DocumentKey {
  fileId: string;
  textHash: string;
  promptVersion: string;
  model: string;
}

/** 사용자별 문서 작업 cache 다. 키에 text hash 가 들어가서 내용이 바뀐 파일은 cache 에 걸리지 않는다. */
export interface TaskCache {
  getCells(key: DocumentKey & { fields: string[] }): Promise<Map<string, TaskCell>>;
  saveCells(key: DocumentKey & { cells: Map<string, TaskCell> }): Promise<void>;
  getSummary(key: DocumentKey & { view: string }): Promise<CachedSummary | null>;
  saveSummary(key: DocumentKey & { view: string; summary: CachedSummary }): Promise<void>;
}

interface TaskExtractionRecord {
  user: unknown;
  fileId: string;
  textHash: string;
  field: string;
  promptVersion: string;
  model: string;
  cell: TaskCell;
}

interface TaskSummaryRecord {
  user: unknown;
  fileId: string;
  textHash: string;
  view: string;
  promptVersion: string;
  model: string;
  summary: string;
  oneLine: string;
  points: CachedSummaryPoint[];
}

export function createMongoTaskCache({
  userId,
  TaskExtraction,
  TaskSummary,
}: {
  userId: string;
  TaskExtraction: Model<TaskExtractionRecord>;
  TaskSummary: Model<TaskSummaryRecord>;
}): TaskCache {
  return {
    async getCells({ fields, ...key }) {
      const rows = await TaskExtraction.find({
        user: userId,
        ...key,
        field: { $in: fields.map(normalizeKey) },
      }).lean<Array<Pick<TaskExtractionRecord, 'field' | 'cell'>>>();
      return new Map(rows.map((row) => [row.field, row.cell]));
    },
    async saveCells({ cells, ...key }) {
      if (cells.size === 0) {
        return;
      }
      await TaskExtraction.bulkWrite(
        Array.from(cells, ([field, cell]) => ({
          updateOne: {
            filter: { user: userId, ...key, field: normalizeKey(field) },
            update: { $set: { cell } },
            upsert: true,
          },
        })),
      );
    },
    async getSummary({ view, ...key }) {
      const row = await TaskSummary.findOne({
        user: userId,
        ...key,
        view: normalizeKey(view),
      }).lean<TaskSummaryRecord | null>();
      return row ? { summary: row.summary, oneLine: row.oneLine, points: row.points } : null;
    },
    async saveSummary({ view, summary, ...key }) {
      await TaskSummary.updateOne(
        { user: userId, ...key, view: normalizeKey(view) },
        { $set: { summary: summary.summary, oneLine: summary.oneLine, points: summary.points } },
        { upsert: true },
      );
    },
  };
}
