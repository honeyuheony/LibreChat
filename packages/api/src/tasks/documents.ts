import { createHash } from 'crypto';

/** `parse: 'text_only'` = text exists but page structure was lost; still processed and counted. */
export interface TaskDocument {
  file_id: string;
  filename: string;
  text: string;
  /** Cache key part; see `documentTextHash`. */
  textHash: string;
  parse: 'ok' | 'text_only';
  /** Start offset of each page in `text`; only PDFs have it. */
  pageStarts?: number[];
  /**
   * Re-reads the source with page structure (PDFs). Until called, `text` is the stored text,
   * so a document whose results are all cached is never downloaded.
   */
  loadPages?: () => Promise<TaskDocument>;
}

export interface PrepareDocumentInput {
  file_id: string;
  filename: string;
  /** Stored File `text`; used when `pages` is absent. */
  text?: string | null;
  /** Per-page text, when the processor re-read a PDF itself. */
  pages?: string[];
  parse?: TaskDocument['parse'];
}

export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Always the stored File `text`, even when the pages were re-read: the estimate endpoint
 * only has the stored text, and its cache count must match the keys the tools write.
 */
export function documentTextHash(input: Pick<PrepareDocumentInput, 'text'>): string {
  return hashText(input.text ?? '');
}

export function prepareDocument(input: PrepareDocumentInput): TaskDocument {
  if (input.pages != null && input.pages.length > 0) {
    const pageStarts: number[] = [];
    let text = '';
    for (const page of input.pages) {
      pageStarts.push(text.length);
      text += `${page}\n`;
    }
    return {
      file_id: input.file_id,
      filename: input.filename,
      text,
      textHash: documentTextHash(input),
      parse: input.parse ?? 'ok',
      pageStarts,
    };
  }
  const text = input.text ?? '';
  return {
    file_id: input.file_id,
    filename: input.filename,
    text,
    textHash: documentTextHash(input),
    parse: input.parse ?? 'ok',
  };
}

export function hasText(doc: TaskDocument): boolean {
  return doc.text.trim().length > 0;
}

/** The stored text can be empty while the re-read pages are not, so both count as readable. */
export function mayHaveText(doc: TaskDocument): boolean {
  return hasText(doc) || doc.loadPages != null;
}

export async function withPages(doc: TaskDocument): Promise<TaskDocument> {
  return doc.loadPages ? doc.loadPages() : doc;
}
