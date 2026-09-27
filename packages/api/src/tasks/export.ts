import * as XLSX from 'xlsx';
import type { TaskCell, TaskResult, TaskTableResult } from 'librechat-data-provider';
import type { TaskDocument } from './documents';
import { normalizeKey } from './cache';

/** 예상 시간을 내는 처리 속도로, 실제 작업량으로 측정하지 않고 어림한 값이다. */
const DOCUMENTS_PER_MINUTE = { min: 25, max: 18 } as const;

export interface TaskEstimate {
  docs: number;
  cached: number;
  minutes: { min: number; max: number };
  allCached: boolean;
}

export function estimateTask({
  docs,
  fields,
  cachedCells,
}: {
  docs: readonly Pick<TaskDocument, 'file_id' | 'textHash'>[];
  fields: readonly string[];
  cachedCells: readonly { fileId: string; textHash: string; field: string }[];
}): TaskEstimate {
  const expectedFields = new Set(fields.map(normalizeKey).filter(Boolean));
  const fieldsByDocument = new Map<string, Set<string>>();
  for (const cell of cachedCells) {
    const documentFields = fieldsByDocument.get(`${cell.fileId}:${cell.textHash}`) ?? new Set();
    documentFields.add(normalizeKey(cell.field));
    fieldsByDocument.set(`${cell.fileId}:${cell.textHash}`, documentFields);
  }
  const cached = docs.filter((doc) => {
    const found = fieldsByDocument.get(`${doc.file_id}:${doc.textHash}`);
    return (
      expectedFields.size > 0 &&
      found != null &&
      [...expectedFields].every((field) => found.has(field))
    );
  }).length;
  const remaining = docs.length - cached;
  return {
    docs: docs.length,
    cached,
    minutes: {
      min: Math.ceil(remaining / DOCUMENTS_PER_MINUTE.min),
      max: Math.ceil(remaining / DOCUMENTS_PER_MINUTE.max),
    },
    allCached: docs.length > 0 && remaining === 0,
  };
}

function formatEvidenceLocation(cell: TaskCell): string {
  if (cell.evidence?.page != null) {
    return `${cell.evidence.page}쪽`;
  }
  if (cell.evidence?.paragraph != null) {
    return `${cell.evidence.paragraph}번째 문단`;
  }
  return '';
}

export function buildTaskWorkbook(result: TaskResult): Buffer {
  if (result.kind !== 'table') {
    throw new Error('Only table task results can be exported as spreadsheets.');
  }
  const table: TaskTableResult = result;
  const rows: Array<Array<string>> = [
    ['파일', ...table.fields],
    ...table.rows.map((row) => [
      row.filename,
      ...row.cells.map((cell) => (cell.value == null ? '없음' : cell.value)),
    ]),
  ];
  const evidence = table.rows.flatMap((row) =>
    row.cells.flatMap((cell, index) =>
      cell.value == null
        ? []
        : [
            {
              파일: row.filename,
              항목: table.fields[index] ?? '',
              값: cell.value,
              인용: cell.evidence?.quote ?? '',
              위치: formatEvidenceLocation(cell),
              상태: cell.status,
            },
          ],
    ),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '표');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(evidence), '근거');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
