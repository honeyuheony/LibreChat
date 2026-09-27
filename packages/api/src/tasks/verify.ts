import type { TaskDocResult, TaskEvidence } from 'librechat-data-provider';
import type { TaskDocument } from './documents';

interface NormalizedText {
  text: string;
  /** `origin[i]` 는 정규화한 문자 `i` 가 원문에서 놓인 위치다. */
  origin: number[];
}

const normalizedCache = new WeakMap<TaskDocument, NormalizedText>();

const isSpace = (ch: string) => /\s/.test(ch);
const isDigitOrLatin = (ch: string | undefined) => ch != null && /[0-9A-Za-z]/.test(ch);

/**
 * 문자마다 NFKC 를 적용하고 이어진 공백을 한 칸으로 접으며, 원문 위치로 돌아가는 대응표를 남긴다.
 * `dropWordSpaces` 면 숫자나 로마자가 맞닿지 않은 공백을 지운다. HWP 는 단어 중간에서도 줄을
 * 바꾸지만, `1\n200` 이 `1200` 으로, `is land` 가 `island` 로 읽히면 안 되기 때문이다.
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

/** 이어진 공백을 모두 한 칸으로 접는다. 인용을 맞춰 볼 때는 단어 사이 공백도 지운다. */
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

/** 빈 줄을 뺀 줄 가운데 몇 번째인지 1부터 센다. HWP·DOCX text 는 한 문단을 한 줄에 둔다. */
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

/** 모델은 prompt 가 시킨 대로 떨어진 곳의 발췌를 빈 줄로 이어 붙인다. */
const EXCERPT_BREAK = /\n[^\S\n]*\n/;
/**
 * 여러 발췌로 된 인용에서 발췌마다 있어야 하는 글자·숫자 수다. 짧은 조각을 이어 붙여 원문에 없는
 * 값을 만들지 못하게 한다. 5는 저장된 데모 칸 55개로 측정해 정했다(47개 통과, 8개는 8자).
 */
const MIN_EXCERPT_CHARS = 5;
const WORD_CHAR = /[\p{L}\p{N}]/gu;

const splitExcerpts = (quote: string) =>
  quote.split(EXCERPT_BREAK).filter((excerpt) => excerpt.trim().length > 0);

/**
 * 정규화한 뒤 문서에서 `quote` 를 그대로 찾고, 없으면 `null` 이다. 여러 발췌로 된 인용은 모든
 * 발췌가 충분히 길고 순서와 상관없이 모두 찾아질 때만 인정하며, 위치는 원문에서 가장 앞선 발췌로 잡는다.
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
 * 모델이 쓴 `[^id]` 표시를 `[^n]` 으로 바꾸며, 모든 text 에 걸쳐 표시마다 번호를 하나씩 준다.
 * hwp-mcp 가 표시마다 각주를 달기 때문에 같은 번호를 다시 쓰지 않는다. 모르는 id 는 지운다.
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

/** HWPX 에 넣는 각주 문구로, 「파일 · 「인용」 · N쪽 M번째 문단」 꼴이다. */
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
