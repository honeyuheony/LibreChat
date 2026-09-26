import { logger } from '@librechat/data-schemas';
import type { TaskCell } from 'librechat-data-provider';
import type { TaskDocument } from './documents';
import type { TaskCache } from './cache';
import type { TaskLLM } from './llm';
import { runPerDocument, type RunPerDocumentOptions } from './perDocument';
import { EXTRACT_PROMPT_VERSION, normalizeKey } from './cache';
import { hasText, mayHaveText, withPages } from './documents';
import { locateQuote } from './verify';
import { invokeJson } from './llm';

/** 추정값: 모델 입력 한도에 맞춘 문서당 글자 수 상한이며 측정하지 않았다. */
export const MAX_DOCUMENT_CHARS = 60_000;

export interface ExtractedRow {
  doc: TaskDocument;
  /** Same order as the requested fields. */
  cells: TaskCell[];
  /** False when the document had no text or the model call failed; cells are then all `none`. */
  reflected: boolean;
  fromCache: boolean;
}

const NONE_CELL: TaskCell = { value: null, status: 'none' };

export function normalizeFields(fields: readonly string[]): string[] {
  return Array.from(new Set(fields.map(normalizeKey).filter((field) => field.length > 0)));
}

export function buildExtractionPrompt(doc: TaskDocument, fields: readonly string[]): string {
  const shape = fields.map((field) => `  ${JSON.stringify(field)}: { "value": ..., "quote": ... }`);
  return [
    'You extract fields from one document. Answer with a single JSON object and nothing else.',
    'For each field: "value" is a short answer in the document language, or null when the document does not state it. Never guess.',
    '"quote" is a verbatim span copied from the document that supports the value (null when value is null). Copy it exactly; do not paraphrase.',
    '',
    'Output shape:',
    '{',
    shape.join(',\n'),
    '}',
    '',
    `Document name: ${doc.filename}`,
    '<document>',
    doc.text.slice(0, MAX_DOCUMENT_CHARS),
    '</document>',
  ].join('\n');
}

/** A value whose quote is not found verbatim in the document is kept but marked `low`. */
export function toVerifiedCell(doc: TaskDocument, raw: unknown): TaskCell {
  const entry = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawValue = typeof entry.value === 'number' ? String(entry.value) : entry.value;
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (value.length === 0) {
    return NONE_CELL;
  }
  const quote = typeof entry.quote === 'string' ? entry.quote.trim() : '';
  const evidence = quote.length > 0 ? locateQuote(doc, quote) : null;
  if (evidence) {
    return { value, status: 'ok', evidence };
  }
  return { value, status: 'low', ...(quote.length > 0 && { evidence: { quote } }) };
}

export async function extractFields({
  docs,
  fields,
  llm,
  cache,
  signal,
  concurrency,
  onSettled,
}: {
  docs: readonly TaskDocument[];
  fields: readonly string[];
  llm: TaskLLM;
  cache: TaskCache;
  signal?: AbortSignal;
} & Pick<RunPerDocumentOptions, 'concurrency' | 'onSettled'>): Promise<ExtractedRow[]> {
  const normalized = normalizeFields(fields);
  const outcomes = await runPerDocument(
    docs,
    async (stored): Promise<ExtractedRow> => {
      const unreflected = (doc: TaskDocument): ExtractedRow => ({
        doc,
        cells: normalized.map(() => NONE_CELL),
        reflected: false,
        fromCache: false,
      });
      if (!mayHaveText(stored)) {
        return unreflected(stored);
      }
      const key = {
        fileId: stored.file_id,
        textHash: stored.textHash,
        promptVersion: EXTRACT_PROMPT_VERSION,
        model: llm.model,
      };
      const cached = await cache.getCells({ ...key, fields: normalized });
      const missing = normalized.filter((field) => !cached.has(field));
      // Cached cells already carry their page evidence, so pages are read only for a miss
      let doc = stored;
      if (missing.length > 0) {
        doc = await withPages(stored);
        if (!hasText(doc)) {
          return unreflected(doc);
        }
        const reply = await invokeJson(llm, buildExtractionPrompt(doc, missing), signal);
        const fresh = new Map(missing.map((field) => [field, toVerifiedCell(doc, reply[field])]));
        await cache.saveCells({ ...key, cells: fresh });
        fresh.forEach((cell, field) => cached.set(field, cell));
      }
      return {
        doc,
        cells: normalized.map((field) => cached.get(field) ?? NONE_CELL),
        reflected: true,
        fromCache: missing.length === 0,
      };
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
      `[tasks] Extraction failed for file ${docs[index].file_id}; counted as not reflected: ${outcome.error.message}`,
    );
    return {
      doc: docs[index],
      cells: normalized.map(() => NONE_CELL),
      reflected: false,
      fromCache: false,
    };
  });
}
