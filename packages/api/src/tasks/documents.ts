import { createHash } from 'crypto';

/** `parse: 'text_only'` 는 text 는 있지만 쪽 구조를 잃은 문서다. 그래도 처리하고 건수에 넣는다. */
export interface TaskDocument {
  file_id: string;
  filename: string;
  text: string;
  /** cache 키에 들어간다(`documentTextHash` 참고). */
  textHash: string;
  parse: 'ok' | 'text_only';
  /** `text` 안에서 각 쪽이 시작하는 위치다. PDF 에만 있다. */
  pageStarts?: number[];
  /**
   * 원본을 쪽 구조와 함께 다시 읽는다(PDF). 부르기 전까지 `text` 는 저장된 text 이므로,
   * 결과가 모두 cache 에 있는 문서는 내려받지 않는다.
   */
  loadPages?: () => Promise<TaskDocument>;
}

export interface PrepareDocumentInput {
  file_id: string;
  filename: string;
  /** 저장된 File `text` 다. `pages` 가 없을 때 쓴다. */
  text?: string | null;
  /** 처리기가 PDF 를 직접 다시 읽었을 때의 쪽별 text 다. */
  pages?: string[];
  parse?: TaskDocument['parse'];
}

export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * 쪽을 다시 읽었더라도 늘 저장된 File `text` 로 만든다. 예상 시간 endpoint 는 저장된 text 만
 * 갖고 있어서, 거기서 센 cache 건수가 tool 이 쓰는 키와 맞아야 한다.
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

/** 저장된 text 가 비어 있어도 다시 읽은 쪽에는 text 가 있을 수 있어서, 둘 다 읽을 수 있는 것으로 본다. */
export function mayHaveText(doc: TaskDocument): boolean {
  return hasText(doc) || doc.loadPages != null;
}

export async function withPages(doc: TaskDocument): Promise<TaskDocument> {
  return doc.loadPages ? doc.loadPages() : doc;
}
