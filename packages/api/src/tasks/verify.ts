import type { TaskDocResult, TaskEvidence } from 'librechat-data-provider';
import type { TaskDocument } from './documents';

interface NormalizedText {
  text: string;
  /** `origin[i]` is the offset in the original text of normalized character `i`. */
  origin: number[];
}

const normalizedCache = new WeakMap<TaskDocument, NormalizedText>();

const isSpace = (ch: string) => /\s/.test(ch);

/**
 * NFKC per character, keeping an offset map back. Whitespace runs fold to one space, or are
 * dropped with `dropSpaces`: HWP text wraps lines inside words, so a quote copied from the
 * rendered sentence would otherwise miss the break the stored text has.
 */
function normalizeWithOrigin(source: string, dropSpaces = false): NormalizedText {
  let text = '';
  const origin: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (isSpace(ch)) {
      pendingSpace = !dropSpaces && text.length > 0;
      continue;
    }
    if (pendingSpace) {
      text += ' ';
      origin.push(i);
      pendingSpace = false;
    }
    for (const part of ch.normalize('NFKC')) {
      if (dropSpaces && isSpace(part)) {
        continue;
      }
      text += part;
      origin.push(i);
    }
  }
  return { text, origin };
}

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
 * Finds `quote` verbatim (after normalization, ignoring whitespace) in the document; `null`
 * when absent. A quote of several excerpts counts only when every excerpt is found, and is
 * located at the first one.
 */
export function locateQuote(doc: TaskDocument, quote: string): TaskEvidence | null {
  const needles = quote
    .split(EXCERPT_BREAK)
    .map((excerpt) => normalizeWithOrigin(excerpt, true).text)
    .filter((needle) => needle.length > 0);
  if (needles.length === 0) {
    return null;
  }
  const haystack = getNormalized(doc);
  const indexes = needles.map((needle) => haystack.text.indexOf(needle));
  if (indexes.some((found) => found < 0)) {
    return null;
  }
  const index = indexes[0];
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
  return [source.filename, `「${evidence.quote}」`, position].filter(Boolean).join(' · ');
}
