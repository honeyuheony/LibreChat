import * as XLSX from 'xlsx';
import type { TaskTableResult } from 'librechat-data-provider';
import { buildTaskWorkbook, estimateTask } from './export';

const tableResult: TaskTableResult = {
  kind: 'table',
  resultId: 'result-1',
  conversationId: 'conversation-1',
  title: '자료 비교표',
  fields: ['분야', '위험'],
  rows: Array.from({ length: 12 }, (_, index) => ({
    file_id: `file-${index + 1}`,
    filename: `자료-${index + 1}.pdf`,
    parse: 'ok',
    cells: [
      {
        value: index < 3 ? `분야 ${index + 1}` : null,
        status: index < 3 ? 'ok' : 'none',
        ...(index < 3 && { evidence: { quote: `인용 ${index + 1}`, page: index + 1 } }),
      },
      {
        value: index < 2 ? `위험 ${index + 1}` : null,
        status: index < 2 ? 'low' : 'none',
        ...(index < 2 && { evidence: { quote: `확인 필요 ${index + 1}`, paragraph: index + 1 } }),
      },
    ],
  })),
  stats: { docs: 12, reflected: 12, none: 19, low: 2, textOnly: 0, cached: 0, seconds: 20 },
  extractor: { promptVersion: 'extract-v1', model: 'test-model' },
  createdAt: '2026-09-26T00:00:00.000Z',
};

describe('task result export', () => {
  test('creates the expected table and evidence sheet rows for twelve documents', () => {
    const workbook = XLSX.read(buildTaskWorkbook(tableResult), { type: 'buffer' });
    const tableRows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['표'], { header: 1 });
    const evidenceRows = XLSX.utils.sheet_to_json(workbook.Sheets['근거']);

    expect(tableRows).toHaveLength(13);
    expect(tableRows[0]).toEqual(['파일', '분야', '위험']);
    expect(tableRows[3]).toEqual(['자료-3.pdf', '분야 3', '없음']);
    expect(evidenceRows).toHaveLength(5);
  });

  test('estimates only documents missing at least one requested field', () => {
    const estimate = estimateTask({
      docs: [
        { file_id: 'file-1', textHash: 'hash-1' },
        { file_id: 'file-2', textHash: 'hash-2' },
      ],
      fields: ['분야', ' 위험 '],
      cachedCells: [
        { fileId: 'file-1', textHash: 'hash-1', field: '분야' },
        { fileId: 'file-1', textHash: 'hash-1', field: '위험' },
      ],
    });

    expect(estimate).toEqual({
      docs: 2,
      cached: 1,
      minutes: { min: 1, max: 1 },
      allCached: false,
    });
  });
});
