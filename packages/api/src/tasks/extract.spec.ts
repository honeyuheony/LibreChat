import { documentName, fakeLLM, makeDoc, memoryCache } from './__tests__/fakes.helper';
import { countExtractionStats, countTopValues, buildTableResult } from './aggregate';
import { extractFields, normalizeFields } from './extract';
import { prepareDocument } from './documents';

const docs = [
  makeDoc('f1', '정세 전망: 긴장 완화가 예상된다.\n전월 대비 12% 증가.'),
  makeDoc('f2', '정세 전망은 불확실하다.'),
  makeDoc('f3', '   '),
];

/** Answers per document: f1 has both values, f2 only 전망 with a paraphrased quote. */
const answers: Record<string, unknown> = {
  'f1.txt': {
    '정세 전망': { value: '긴장 완화', quote: '긴장 완화가 예상된다' },
    '전월 대비': { value: '+12%', quote: '전월 대비 12% 증가' },
  },
  'f2.txt': {
    '정세 전망': { value: '불확실', quote: '앞날을 알 수 없다' },
    '전월 대비': { value: null, quote: null },
  },
};

describe('extractFields', () => {
  it('marks missing values none, unverifiable quotes low, and textless files unreflected', async () => {
    const { llm } = fakeLLM((prompt) => answers[documentName(prompt)]);
    const rows = await extractFields({
      docs,
      fields: ['정세 전망', '전월 대비'],
      llm,
      cache: memoryCache(),
    });
    expect(rows.map((row) => row.cells.map((cell) => cell.status))).toEqual([
      ['ok', 'ok'],
      ['low', 'none'],
      ['none', 'none'],
    ]);
    expect(rows.map((row) => row.reflected)).toEqual([true, true, false]);
    expect(rows[0].cells[1]).toEqual({
      value: '+12%',
      status: 'ok',
      evidence: { quote: '전월 대비 12% 증가', paragraph: 2 },
    });
  });

  it('verifies a quote made of excerpts from separate places, as the prompt asks for', async () => {
    const { llm, prompts } = fakeLLM(() => ({
      '전월 대비': {
        value: '12% 증가, 긴장 완화',
        quote: '긴장 완화가 예상된다\n\n전월 대비 12% 증가',
      },
    }));
    const rows = await extractFields({
      docs: docs.slice(0, 1),
      fields: ['전월 대비'],
      llm,
      cache: memoryCache(),
    });
    expect(prompts[0]).toContain('separate them with a blank line');
    expect(rows[0].cells[0]).toMatchObject({ status: 'ok', evidence: { paragraph: 1 } });
  });

  it('makes no model call when every requested field is cached', async () => {
    const cache = memoryCache();
    const first = fakeLLM((prompt) => answers[documentName(prompt)]);
    await extractFields({ docs, fields: ['정세 전망', '전월 대비'], llm: first.llm, cache });
    const second = fakeLLM((prompt) => answers[documentName(prompt)]);
    const rows = await extractFields({ docs, fields: ['전월 대비'], llm: second.llm, cache });
    expect(second.prompts).toHaveLength(0);
    expect(rows.slice(0, 2).map((row) => row.fromCache)).toEqual([true, true]);
  });

  it('re-reads a document with pages only when a field is missing from the cache', async () => {
    const stored = makeDoc('p1', '정세 전망: 긴장 완화가 예상된다.', 'p1.pdf');
    const loadPages = jest.fn(async () =>
      prepareDocument({
        file_id: 'p1',
        filename: 'p1.pdf',
        text: stored.text,
        pages: ['표지', '정세 전망: 긴장 완화가 예상된다.'],
      }),
    );
    const pdf = { ...stored, loadPages };
    const reply = () => ({
      '정세 전망': { value: '긴장 완화', quote: '긴장 완화가 예상된다' },
      위험도: { value: null, quote: null },
    });
    const cache = memoryCache();
    const first = fakeLLM(reply);
    const [row] = await extractFields({
      docs: [pdf],
      fields: ['정세 전망'],
      llm: first.llm,
      cache,
    });
    expect(loadPages).toHaveBeenCalledTimes(1);
    expect(first.prompts[0]).toContain('표지');
    expect(row.cells[0]).toMatchObject({ status: 'ok', evidence: { page: 2 } });

    const second = fakeLLM(reply);
    const [cached] = await extractFields({
      docs: [{ ...stored, loadPages }],
      fields: ['정세 전망'],
      llm: second.llm,
      cache,
    });
    expect(loadPages).toHaveBeenCalledTimes(1);
    expect(cached).toMatchObject({ fromCache: true, reflected: true });
    expect(cached.cells[0]).toMatchObject({ evidence: { page: 2 } });

    await extractFields({ docs: [pdf], fields: ['정세 전망', '위험도'], llm: second.llm, cache });
    expect(loadPages).toHaveBeenCalledTimes(2);
  });

  it('asks the model only for fields missing from the cache', async () => {
    const cache = memoryCache();
    const first = fakeLLM((prompt) => answers[documentName(prompt)]);
    await extractFields({ docs: docs.slice(0, 1), fields: ['정세 전망'], llm: first.llm, cache });
    const second = fakeLLM(() => ({ 위험도: { value: '중간', quote: '긴장 완화' } }));
    await extractFields({
      docs: docs.slice(0, 1),
      fields: ['정세 전망', '위험도'],
      llm: second.llm,
      cache,
    });
    expect(second.prompts).toHaveLength(1);
    expect(second.prompts[0]).toContain('"위험도"');
    expect(second.prompts[0]).not.toContain('"정세 전망"');
  });

  it('counts a document whose reply is never JSON as unreflected instead of failing the task', async () => {
    const { llm, prompts } = fakeLLM(() => 'not json');
    const rows = await extractFields({
      docs: docs.slice(0, 1),
      fields: ['정세 전망'],
      llm,
      cache: memoryCache(),
    });
    expect(rows[0].reflected).toBe(false);
    expect(prompts).toHaveLength(2);
  });
});

describe('normalizeFields', () => {
  it('trims, folds full-width characters, and drops duplicates and blanks', () => {
    expect(normalizeFields([' 정세 전망 ', '정세 전망', 'ＡＢＣ', ''])).toEqual([
      '정세 전망',
      'ABC',
    ]);
  });
});

describe('table aggregation', () => {
  it('counts none and low only in reflected rows and counts cached rows', async () => {
    const { llm } = fakeLLM((prompt) => answers[documentName(prompt)]);
    const rows = await extractFields({
      docs,
      fields: ['정세 전망', '전월 대비'],
      llm,
      cache: memoryCache(),
    });
    expect(countExtractionStats(rows, 0, 3_400)).toEqual({
      docs: 3,
      reflected: 2,
      none: 1,
      low: 1,
      textOnly: 0,
      cached: 0,
      seconds: 3,
    });
  });

  it('ranks top values by count', async () => {
    const same = [makeDoc('a', 'x'), makeDoc('b', 'x'), makeDoc('c', 'x')];
    const values: Record<string, string> = { 'a.txt': '높음', 'b.txt': '낮음', 'c.txt': '낮음' };
    const { llm } = fakeLLM((prompt) => ({
      위험도: { value: values[documentName(prompt)], quote: 'x' },
    }));
    const rows = await extractFields({ docs: same, fields: ['위험도'], llm, cache: memoryCache() });
    expect(countTopValues(rows, 0)).toEqual([
      { value: '낮음', count: 2 },
      { value: '높음', count: 1 },
    ]);
  });

  it('builds one table row per document in input order', async () => {
    const { llm } = fakeLLM((prompt) => answers[documentName(prompt)]);
    const rows = await extractFields({
      docs,
      fields: ['정세 전망', '전월 대비'],
      llm,
      cache: memoryCache(),
    });
    const table = buildTableResult({
      resultId: 'r1',
      conversationId: 'c1',
      title: '비교표',
      fields: ['정세 전망', '전월 대비'],
      rows,
      model: 'fake-model',
      startedAt: 0,
      finishedAt: 1_000,
    });
    expect(table.rows.map((row) => [row.file_id, row.cells[0].value])).toEqual([
      ['f1', '긴장 완화'],
      ['f2', '불확실'],
      ['f3', null],
    ]);
    expect(table.extractor).toEqual({ promptVersion: 'extract-v2', model: 'fake-model' });
  });
});
