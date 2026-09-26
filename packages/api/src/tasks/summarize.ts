import { logger } from '@librechat/data-schemas';
import type { TaskDocResult } from 'librechat-data-provider';
import type { CachedSummary, TaskCache } from './cache';
import type { TaskDocument } from './documents';
import type { FootnoteSource } from './verify';
import type { TaskLLM } from './llm';
import { runPerDocument, type RunPerDocumentOptions } from './perDocument';
import { SUMMARY_PROMPT_VERSION, normalizeKey } from './cache';
import { locateQuote, numberFootnotes } from './verify';
import { MAX_DOCUMENT_CHARS } from './extract';
import { hasText } from './documents';
import { toStats } from './aggregate';
import { invokeJson } from './llm';

/** 와이어프레임의 2단 합산 규칙(`groups = ceil(n/20)`)을 따른 값이다. */
export const SUMMARY_GROUP_SIZE = 20;

export const UNREAD_DOCUMENT_LINE = '본문을 읽지 못해 요약하지 못했습니다.';

export interface DocumentSummary {
  doc: TaskDocument;
  summary: CachedSummary | null;
  fromCache: boolean;
}

interface MergedText {
  trend: string;
  common: string;
}

export function chunkForMerge<T>(items: readonly T[], size: number = SUMMARY_GROUP_SIZE): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

export function buildDocumentSummaryPrompt(doc: TaskDocument, view: string): string {
  return [
    `Summarize one document from this viewpoint: ${view}.`,
    'Answer with a single JSON object and nothing else, in the document language:',
    '{ "summary": "3-5 sentences", "one_line": "one sentence", "points": [{ "text": "key point", "quote": "verbatim span copied from the document" }] }',
    'Give 2-6 points. Every quote must be copied exactly from the document; do not paraphrase.',
    '',
    `Document name: ${doc.filename}`,
    '<document>',
    doc.text.slice(0, MAX_DOCUMENT_CHARS),
    '</document>',
  ].join('\n');
}

function readDocumentSummary(reply: Record<string, unknown>): CachedSummary {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const rawPoints = Array.isArray(reply.points) ? reply.points : [];
  const points = rawPoints
    .map((point) => (point != null && typeof point === 'object' ? point : {}))
    .map((point: Record<string, unknown>) => ({ text: text(point.text), quote: text(point.quote) }))
    .filter((point) => point.text.length > 0 && point.quote.length > 0)
    .map((point, index) => ({ id: `p${index + 1}`, ...point }));
  const summary = text(reply.summary);
  const oneLine = text(reply.one_line) || summary.split('\n')[0];
  if (!summary || !oneLine) {
    throw new Error('The model returned an empty summary.');
  }
  return { summary, oneLine, points };
}

export async function summarizeDocuments({
  docs,
  view,
  llm,
  cache,
  signal,
  concurrency,
  onSettled,
}: {
  docs: readonly TaskDocument[];
  view: string;
  llm: TaskLLM;
  cache: TaskCache;
  signal?: AbortSignal;
} & Pick<RunPerDocumentOptions, 'concurrency' | 'onSettled'>): Promise<DocumentSummary[]> {
  const normalizedView = normalizeKey(view);
  const outcomes = await runPerDocument(
    docs,
    async (doc): Promise<DocumentSummary> => {
      if (!hasText(doc)) {
        return { doc, summary: null, fromCache: false };
      }
      const key = {
        fileId: doc.file_id,
        textHash: doc.textHash,
        view: normalizedView,
        promptVersion: SUMMARY_PROMPT_VERSION,
        model: llm.model,
      };
      const cached = await cache.getSummary(key);
      if (cached) {
        return { doc, summary: cached, fromCache: true };
      }
      const reply = await invokeJson(llm, buildDocumentSummaryPrompt(doc, normalizedView), signal);
      const summary = readDocumentSummary(reply);
      await cache.saveSummary({ ...key, summary });
      return { doc, summary, fromCache: false };
    },
    { concurrency, signal, onSettled },
  );
  if (signal?.aborted) {
    throw new Error('Task aborted');
  }
  return outcomes.map((outcome, index) => {
    if (outcome.ok) {
      return outcome.value;
    }
    logger.warn(
      `[tasks] Summary failed for file ${docs[index].file_id}; counted as not reflected: ${outcome.error.message}`,
    );
    return { doc: docs[index], summary: null, fromCache: false };
  });
}

/** Point ids are `d<doc number>p<k>` so they stay unique across the whole merge. */
export function pointId(docIndex: number, localId: string): string {
  return `d${docIndex + 1}${localId}`;
}

function buildMergePrompt(view: string, sections: string[]): string {
  return [
    `Merge the material below into one summary from this viewpoint: ${view}.`,
    'Answer with a single JSON object and nothing else, in the material language:',
    '{ "trend": "overall trend, markdown paragraphs", "common": "points shared across documents, markdown bullet list" }',
    'Cite supporting points by appending their ids as footnote markers like [^d3p1]. Use only ids that appear below.',
    '',
    ...sections,
  ].join('\n');
}

function readMerged(reply: Record<string, unknown>): MergedText {
  return {
    trend: typeof reply.trend === 'string' ? reply.trend.trim() : '',
    common: typeof reply.common === 'string' ? reply.common.trim() : '',
  };
}

/** One merge for up to 20 documents; above that, merge each group of 20 and then the groups. */
export async function mergeSummaries({
  summaries,
  view,
  llm,
  signal,
}: {
  summaries: readonly DocumentSummary[];
  view: string;
  llm: TaskLLM;
  signal?: AbortSignal;
}): Promise<MergedText> {
  const blocks = summaries.flatMap((entry, index) => {
    if (!entry.summary) {
      return [];
    }
    const points = entry.summary.points.map(
      (point) => `  - [${pointId(index, point.id)}] ${point.text}`,
    );
    return [[`### ${entry.doc.filename}`, entry.summary.summary, 'Points:', ...points].join('\n')];
  });
  if (blocks.length === 0) {
    return { trend: '', common: '' };
  }
  const groups = chunkForMerge(blocks);
  if (groups.length === 1) {
    return readMerged(await invokeJson(llm, buildMergePrompt(view, groups[0]), signal));
  }
  const partials: MergedText[] = [];
  for (const group of groups) {
    partials.push(readMerged(await invokeJson(llm, buildMergePrompt(view, group), signal)));
  }
  const sections = partials.map(
    (partial, index) =>
      `### Group ${index + 1}\nTrend:\n${partial.trend}\nCommon:\n${partial.common}\n(Keep the [^id] markers of the text you reuse.)`,
  );
  return readMerged(await invokeJson(llm, buildMergePrompt(view, sections), signal));
}

export function buildSummaryResult({
  resultId,
  conversationId,
  view,
  summaries,
  merged,
  startedAt,
  finishedAt,
}: {
  resultId: string;
  conversationId: string;
  view: string;
  summaries: readonly DocumentSummary[];
  merged: MergedText;
  startedAt: number;
  finishedAt: number;
}): TaskDocResult {
  const sources = new Map<string, FootnoteSource>();
  let unverified = 0;
  summaries.forEach((entry, index) => {
    for (const point of entry.summary?.points ?? []) {
      const evidence = locateQuote(entry.doc, point.quote);
      if (!evidence) {
        unverified++;
        continue;
      }
      sources.set(pointId(index, point.id), {
        file_id: entry.doc.file_id,
        filename: entry.doc.filename,
        evidence,
      });
    }
  });
  const numbered = numberFootnotes([merged.trend, merged.common], sources);
  const [trend, common] = numbered.texts;
  const perDoc = summaries.map((entry) => ({
    file_id: entry.doc.file_id,
    filename: entry.doc.filename,
    line: entry.summary?.oneLine ?? UNREAD_DOCUMENT_LINE,
  }));
  const body = [
    '## 전체 경향',
    trend,
    '',
    '## 공통 사항',
    common,
    '',
    '## 문서별 한 줄',
    ...perDoc.map((entry) => `- **${entry.filename}**: ${entry.line}`),
  ].join('\n');

  return {
    kind: 'summary',
    resultId,
    conversationId,
    title: `통합 요약 · ${view}`,
    view,
    body,
    footnotes: numbered.footnotes,
    perDoc,
    stats: toStats({
      docs: summaries.length,
      reflected: summaries.filter((entry) => entry.summary != null).length,
      none: 0,
      low: unverified + numbered.removed,
      textOnly: summaries.filter((entry) => entry.doc.parse === 'text_only').length,
      cached: summaries.filter((entry) => entry.fromCache).length,
      startedAt,
      finishedAt,
    }),
    createdAt: new Date(finishedAt).toISOString(),
  };
}
