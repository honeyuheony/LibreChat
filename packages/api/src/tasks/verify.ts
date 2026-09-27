import type { TaskDocResult, TaskEvidence } from 'librechat-data-provider';
import type { TaskDocument } from './documents';

interface NormalizedText {
  text: string;
  /** `origin[i]` is the offset in the original text of normalized character `i`. */
  origin: number[];
}

const normalizedCache = new WeakMap<TaskDocument, NormalizedText>();

const isSpace = (ch: string) => /\s/.test(ch);
const isDigitOrLatin = (ch: string | undefined) => ch != null && /[0-9A-Za-z]/.test(ch);

/**
 * NFKC per character with whitespace runs folded to one space, keeping an offset map back.
 * `dropWordSpaces` drops a run unless a digit or Latin letter touches it: HWP wraps lines inside
 * words, while `1\n200` must not read as `1200` nor `is land` as `island`.
 */
function normalizeWithOrigin(source: string, dropWordSpaces = false): NormalizedText {
  let text = '';
  const origin: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (isSpace(ch)) {
      pendingSpace = text.length > 0;
      continue;
    }
    const parts = ch.normalize('NFKC');
    const keepSpace =
      !dropWordSpaces || isDigitOrLatin(text[text.length - 1]) || isDigitOrLatin(parts[0]);
    if (pendingSpace && keepSpace) {
      text += ' ';
      origin.push(i);
    }
    pendingSpace = false;
    for (const part of parts) {
      text += part;
      origin.push(i);
    }
  }
  return { text, origin };
}

/** Folds every whitespace run to one space; quote matching also drops spaces between words. */
export function normalizeQuote(quote: string): string {
  return normalizeWithOrigin(quote).text;
}

function getNormalized(doc: TaskDocument): NormalizedText {
  let normalized = normalizedCache.get(doc);
  if (!normalized) {
    normalized = normalizeWithOrigin(doc.text, true);
    normalizedCache.set(doc, normalized);
  }
  return normalized;
}

/** 1-based index among non-empty lines; HWP·DOCX text keeps one paragraph per line. */
function paragraphAt(text: string, offset: number): number {
  let paragraph = 0;
  let lineHasText = false;
  for (let i = 0; i < offset && i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      if (lineHasText) {
        paragraph++;
      }
      lineHasText = false;
    } else if (!isSpace(ch)) {
      lineHasText = true;
    }
  }
  return paragraph + 1;
}

function pageAt(pageStarts: number[] | undefined, offset: number): number | undefined {
  if (!pageStarts || pageStarts.length === 0) {
    return undefined;
  }
  let page = 1;
  for (let i = 0; i < pageStarts.length; i++) {
    if (pageStarts[i] <= offset) {
      page = i + 1;
    }
  }
  return page;
}

/** Models join excerpts from separate places with a blank line, as the prompt asks. */
const EXCERPT_BREAK = /\n[^\S\n]*\n/;
/**
 * Letters and digits each excerpt of a multi-excerpt quote needs, so short pieces cannot be
 * combined into a value the text never states. 5 measured on 55 stored demo cells: 47 pass, 8 at 8.
 */
const MIN_EXCERPT_CHARS = 5;
const WORD_CHAR = /[\p{L}\p{N}]/gu;

const splitExcerpts = (quote: string) =>
  quote.split(EXCERPT_BREAK).filter((excerpt) => excerpt.trim().length > 0);

/**
 * Finds `quote` verbatim (after normalization) in the document; `null` when absent. A quote
 * of several excerpts counts only when every excerpt is long enough and found, in any order,
 * and is located at the excerpt earliest in the text.
 */
export function locateQuote(doc: TaskDocument, quote: string): TaskEvidence | null {
  const needles = splitExcerpts(quote).map((excerpt) => normalizeWithOrigin(excerpt, true).text);
  if (needles.length === 0) {
    return null;
  }
  if (
    needles.length > 1 &&
    needles.some((needle) => (needle.match(WORD_CHAR)?.length ?? 0) < MIN_EXCERPT_CHARS)
  ) {
    return null;
  }
  const haystack = getNormalized(doc);
  const indexes = needles.map((needle) => haystack.text.indexOf(needle));
  if (indexes.some((found) => found < 0)) {
    return null;
  }
  const index = Math.min(...indexes);
  const offset = haystack.origin[index];
  const page = pageAt(doc.pageStarts, offset);
  const pageOffset = page != null && doc.pageStarts ? doc.pageStarts[page - 1] : 0;
  return {
    quote,
    ...(page != null && { page }),
    paragraph: paragraphAt(doc.text.slice(pageOffset), offset - pageOffset),
  };
}

export interface FootnoteSource {
  file_id: string;
  filename: string;
  evidence: TaskEvidence;
}

const MARKER_PATTERN = /\[\^([A-Za-z0-9_-]+)\]/g;

/**
 * Rewrites model-written `[^id]` markers to `[^n]`, one number per marker across all texts.
 * No number is reused: hwp-mcp attaches a footnote at every marker. Unknown ids are removed.
 */
export function numberFootnotes(
  texts: readonly string[],
  sources: ReadonlyMap<string, FootnoteSource>,
): { texts: string[]; footnotes: TaskDocResult['footnotes']; removed: number } {
  const footnotes: TaskDocResult['footnotes'] = [];
  let removed = 0;
  const rewritten = texts.map((text) =>
    text.replace(MARKER_PATTERN, (_marker, id: string) => {
      const source = sources.get(id);
      if (!source) {
        removed++;
        return '';
      }
      const n = footnotes.length + 1;
      footnotes.push({ n, ...source });
      return `[^${n}]`;
    }),
  );
  return { texts: rewritten, footnotes, removed };
}

/** 「파일 · 「인용」 · N쪽 M번째 문단」, the footnote text written into the HWPX. */
export function formatFootnote(source: Pick<FootnoteSource, 'filename' | 'evidence'>): string {
  const { evidence } = source;
  const position = [
    evidence.page != null ? `${evidence.page}쪽` : '',
    evidence.paragraph != null ? `${evidence.paragraph}번째 문단` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const quote = splitExcerpts(evidence.quote)
    .map((excerpt) => normalizeQuote(excerpt))
    .join(' … ');
  return [source.filename, `「${quote}」`, position].filter(Boolean).join(' · ');
}
