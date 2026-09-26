import { createHash } from 'crypto';

/** `parse: 'text_only'` = text exists but page structure was lost; still processed and counted. */
export interface TaskDocument {
  file_id: string;
  filename: string;
  text: string;
  textHash: string;
  parse: 'ok' | 'text_only';
  /** Start offset of each page in `text`; only PDFs have it. */
  pageStarts?: number[];
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
      textHash: hashText(text),
      parse: input.parse ?? 'ok',
      pageStarts,
    };
  }
  const text = input.text ?? '';
  return {
    file_id: input.file_id,
    filename: input.filename,
    text,
    textHash: hashText(text),
    parse: input.parse ?? 'ok',
  };
}

export function hasText(doc: TaskDocument): boolean {
  return doc.text.trim().length > 0;
}
