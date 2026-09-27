import {
  chunkForMerge,
  mergeSummaries,
  summarizeDocuments,
  buildSummaryResult,
  UNREAD_DOCUMENT_LINE,
} from './summarize';
import { documentName, fakeLLM, makeDoc, memoryCache } from './__tests__/fakes.helper';
import { prepareDocument } from './documents';

function makeDocs(count: number) {
  return Array.from({ length: count }, (_, i) =>
    makeDoc(`f${i + 1}`, `문서 ${i + 1} 본문. 위험 요인 ${i + 1}번이 확인되었다.`),
  );
}

/** 문서별 답은 자기 text 를 인용하고, 합치기 답은 d1p1 과 없는 id 하나를 인용한다. */
function summaryModel() {
  return fakeLLM((prompt) => {
    if (prompt.startsWith('Merge')) {
      return {
        trend: '전반적으로 위험이 늘었다.[^d1p1] 근거 없는 주장[^d99p9]',
        common: '- 공통 위험[^d2p1]',
      };
    }
    const name = documentName(prompt).replace('.txt', '');
    const n = name.slice(1);
    return {
      summary: `${name} 요약`,
      one_line: `${name} 한 줄`,
      points: [{ text: `위험 ${n}`, quote: `위험 요인 ${n}번이 확인되었다` }],
    };
  });
}

describe('chunkForMerge', () => {
  it('splits 45 items into groups of 20, 20 and 5', () => {
    expect(chunkForMerge(Array.from({ length: 45 }, (_, i) => i)).map((g) => g.length)).toEqual([
      20, 20, 5,
    ]);
  });
});

describe('summarize documents', () => {
  it('calls the model once per document plus one merge for 12 documents', async () => {
    const docs = makeDocs(12);
    const { llm, prompts } = summaryModel();
    const summaries = await summarizeDocuments({
      docs,
      view: '위험 요인 중심',
      llm,
      cache: memoryCache(),
    });
    await mergeSummaries({ summaries, view: '위험 요인 중심', llm });
    expect(prompts).toHaveLength(13);
  });

  it('merges per group and then once more above 20 documents', async () => {
    const docs = makeDocs(21);
    const { llm, prompts } = summaryModel();
    const summaries = await summarizeDocuments({
      docs,
      view: '간부 보고용',
      llm,
      cache: memoryCache(),
    });
    await mergeSummaries({ summaries, view: '간부 보고용', llm });
    expect(prompts.filter((prompt) => prompt.startsWith('Merge'))).toHaveLength(3);
  });

  it('reuses cached per-document summaries for the same view', async () => {
    const docs = makeDocs(3);
    const cache = memoryCache();
    await summarizeDocuments({ docs, view: '간부 보고용', llm: summaryModel().llm, cache });
    const again = summaryModel();
    const summaries = await summarizeDocuments({
      docs,
      view: '간부 보고용',
      llm: again.llm,
      cache,
    });
    expect(again.prompts).toHaveLength(0);
    expect(summaries.every((entry) => entry.fromCache)).toBe(true);
  });

  it('re-reads pages even for cached summaries so evidence keeps its page', async () => {
    const stored = makeDoc('f1', '문서 1 본문. 위험 요인 1번이 확인되었다.', 'f1.txt');
    const loadPages = jest.fn(async () =>
      prepareDocument({
        file_id: 'f1',
        filename: 'f1.txt',
        text: stored.text,
        pages: ['표지', '문서 1 본문. 위험 요인 1번이 확인되었다.'],
      }),
    );
    const cache = memoryCache();
    await summarizeDocuments({
      docs: [{ ...stored, loadPages }],
      view: '위험',
      llm: summaryModel().llm,
      cache,
    });
    const [entry] = await summarizeDocuments({
      docs: [{ ...stored, loadPages }],
      view: '위험',
      llm: summaryModel().llm,
      cache,
    });
    expect(entry.fromCache).toBe(true);
    expect(loadPages).toHaveBeenCalledTimes(2);
    expect(entry.doc.pageStarts).toEqual([0, 3]);
  });

  it('lists every document in 문서별 한 줄, including unreadable ones, in input order', async () => {
    const docs = [...makeDocs(2), makeDoc('f3', '')];
    const { llm } = summaryModel();
    const summaries = await summarizeDocuments({
      docs,
      view: '간부 보고용',
      llm,
      cache: memoryCache(),
    });
    const merged = await mergeSummaries({ summaries, view: '간부 보고용', llm });
    const result = buildSummaryResult({
      resultId: 'r1',
      conversationId: 'c1',
      view: '간부 보고용',
      summaries,
      merged,
      startedAt: 0,
      finishedAt: 2_000,
    });
    expect(result.perDoc).toEqual([
      { file_id: 'f1', filename: 'f1.txt', line: 'f1 한 줄' },
      { file_id: 'f2', filename: 'f2.txt', line: 'f2 한 줄' },
      { file_id: 'f3', filename: 'f3.txt', line: UNREAD_DOCUMENT_LINE },
    ]);
    expect(result.stats.reflected).toBe(2);
    expect(result.body).toContain('- **f3.txt**: ' + UNREAD_DOCUMENT_LINE);
  });

  it('numbers cited point ids as footnotes and counts unknown ids as low', async () => {
    const docs = makeDocs(2);
    const { llm } = summaryModel();
    const summaries = await summarizeDocuments({
      docs,
      view: '간부 보고용',
      llm,
      cache: memoryCache(),
    });
    const merged = await mergeSummaries({ summaries, view: '간부 보고용', llm });
    const result = buildSummaryResult({
      resultId: 'r1',
      conversationId: 'c1',
      view: '간부 보고용',
      summaries,
      merged,
      startedAt: 0,
      finishedAt: 1_000,
    });
    expect(result.body).toContain('전반적으로 위험이 늘었다.[^1] 근거 없는 주장');
    expect(result.body).toContain('- 공통 위험[^2]');
    expect(result.footnotes.map((note) => [note.n, note.file_id, note.evidence.quote])).toEqual([
      [1, 'f1', '위험 요인 1번이 확인되었다'],
      [2, 'f2', '위험 요인 2번이 확인되었다'],
    ]);
    expect(result.stats.low).toBe(1);
    expect(result.title).toBe('통합 요약 · 간부 보고용');
  });
});
