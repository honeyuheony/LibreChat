import type { TaskStats, TaskTableResult } from 'librechat-data-provider';
import type { ExtractedRow } from './extract';
import { EXTRACT_PROMPT_VERSION } from './cache';

export interface StatsInput {
  docs: number;
  reflected: number;
  none: number;
  low: number;
  textOnly: number;
  cached: number;
  startedAt: number;
  finishedAt: number;
}

export function toStats(input: StatsInput): TaskStats {
  return {
    docs: input.docs,
    reflected: input.reflected,
    none: input.none,
    low: input.low,
    textOnly: input.textOnly,
    cached: input.cached,
    seconds: Math.max(0, Math.round((input.finishedAt - input.startedAt) / 1000)),
  };
}

/** 반영하지 못한 문서의 칸은 읽지도 않았으므로 「값 없음」으로 세지 않는다. */
export function countExtractionStats(
  rows: readonly ExtractedRow[],
  startedAt: number,
  finishedAt: number,
): TaskStats {
  let none = 0;
  let low = 0;
  for (const row of rows) {
    if (!row.reflected) {
      continue;
    }
    for (const cell of row.cells) {
      if (cell.status === 'none') {
        none++;
      } else if (cell.status === 'low') {
        low++;
      }
    }
  }
  return toStats({
    docs: rows.length,
    reflected: rows.filter((row) => row.reflected).length,
    none,
    low,
    textOnly: rows.filter((row) => row.doc.parse === 'text_only').length,
    cached: rows.filter((row) => row.fromCache).length,
    startedAt,
    finishedAt,
  });
}

/** 횟수가 같은 값은 먼저 나온 값을 앞에 둔다. */
export function countTopValues(
  rows: readonly ExtractedRow[],
  fieldIndex: number,
  limit = 3,
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row.cells[fieldIndex]?.value;
    if (value != null) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function buildTableResult({
  resultId,
  conversationId,
  title,
  fields,
  rows,
  model,
  startedAt,
  finishedAt,
}: {
  resultId: string;
  conversationId: string;
  title: string;
  fields: string[];
  rows: readonly ExtractedRow[];
  model: string;
  startedAt: number;
  finishedAt: number;
}): TaskTableResult {
  return {
    kind: 'table',
    resultId,
    conversationId,
    title,
    fields,
    rows: rows.map((row) => ({
      file_id: row.doc.file_id,
      filename: row.doc.filename,
      parse: row.doc.parse,
      cells: row.cells,
    })),
    stats: countExtractionStats(rows, startedAt, finishedAt),
    extractor: { promptVersion: EXTRACT_PROMPT_VERSION, model },
    createdAt: new Date(finishedAt).toISOString(),
  };
}
