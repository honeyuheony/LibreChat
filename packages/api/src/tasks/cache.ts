import type { TaskCell } from 'librechat-data-provider';
import type { Model } from 'mongoose';

/** Bump when the extraction prompt or its output contract changes; old rows stop matching. */
export const EXTRACT_PROMPT_VERSION = 'extract-v1';
/** Bump when the per-document summary prompt or its output contract changes. */
export const SUMMARY_PROMPT_VERSION = 'summary-v1';

/** Trim and NFKC (full-width → half-width) only; 「전망」 and 「정세 전망」 stay distinct. */
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

/** Per-user cache of per-document work; the key includes the text hash so edited files miss. */
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
