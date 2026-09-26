import type { FootnoteSource } from './verify';
import { formatFootnote, locateQuote, numberFootnotes } from './verify';
import { prepareDocument } from './documents';

const hwpText = [
  '2026년 3분기 정세 보고',
  '',
  '정치 부문에서는 9.9절 행사가 간소화되었다.',
  '경제 부문의 식량 수급 전망은 하향 조정되었다.',
].join('\n');

describe('locateQuote', () => {
  it('finds a verbatim quote and reports its paragraph among non-empty lines', () => {
    const doc = prepareDocument({ file_id: 'f1', filename: 'a.hwp', text: hwpText });
    expect(locateQuote(doc, '식량 수급 전망은 하향 조정')).toEqual({
      quote: '식량 수급 전망은 하향 조정',
      paragraph: 3,
    });
  });

  it('matches across different whitespace and full-width digits', () => {
    const doc = prepareDocument({ file_id: 'f1', filename: 'a.hwp', text: hwpText });
    expect(locateQuote(doc, '９.９절   행사가\n간소화')?.paragraph).toBe(2);
  });

  it('returns null for a paraphrase that is not in the text', () => {
    const doc = prepareDocument({ file_id: 'f1', filename: 'a.hwp', text: hwpText });
    expect(locateQuote(doc, '식량 전망을 낮췄다')).toBeNull();
  });

  it('matches a word the HWP line wrap split across paragraphs', () => {
    const doc = prepareDocument({
      file_id: 'f1',
      filename: 'a.hwp',
      text: '모집 공고\n\n  봉사하실 인천가좌\n\n여자중학교 배움터지킴이를 모십니다.',
    });
    expect(locateQuote(doc, '봉사하실 인천가좌여자중학교 배움터지킴이')?.paragraph).toBe(2);
  });

  it('accepts excerpts joined by blank lines when each one is verbatim, located at the first', () => {
    const doc = prepareDocument({ file_id: 'f1', filename: 'a.hwp', text: hwpText });
    const quote = '경제 부문의 식량 수급\n\n9.9절 행사가 간소화';
    expect(locateQuote(doc, quote)).toEqual({ quote, paragraph: 3 });
  });

  it('rejects joined excerpts when any one of them is not in the text', () => {
    const doc = prepareDocument({ file_id: 'f1', filename: 'a.hwp', text: hwpText });
    expect(locateQuote(doc, '9.9절 행사가 간소화\n\n식량 전망을 낮췄다')).toBeNull();
  });

  it('reports the page and the paragraph within that page for PDFs', () => {
    const doc = prepareDocument({
      file_id: 'p1',
      filename: 'b.pdf',
      pages: ['표지 제목', '첫 줄\n둘째 줄에 핵심 수치 12%가 있다'],
    });
    expect(locateQuote(doc, '핵심 수치 12%')).toEqual({
      quote: '핵심 수치 12%',
      page: 2,
      paragraph: 2,
    });
  });
});

describe('numberFootnotes', () => {
  const source = (file_id: string, quote: string): FootnoteSource => ({
    file_id,
    filename: `${file_id}.hwp`,
    evidence: { quote, paragraph: 1 },
  });
  const sources = new Map([
    ['c1_1', source('f1', '가')],
    ['c2_1', source('f2', '나')],
  ]);

  it('gives every marker its own number in order, even for a repeated id', () => {
    const numbered = numberFootnotes(['첫 문장[^c2_1] 둘째[^c1_1]', '다시[^c2_1]'], sources);
    expect(numbered.texts).toEqual(['첫 문장[^1] 둘째[^2]', '다시[^3]']);
    expect(numbered.footnotes.map((note) => [note.n, note.file_id])).toEqual([
      [1, 'f2'],
      [2, 'f1'],
      [3, 'f2'],
    ]);
  });

  it('removes and counts markers whose id has no source', () => {
    const numbered = numberFootnotes(['근거 없음[^c9_9] 근거 있음[^c1_1]'], sources);
    expect(numbered.texts).toEqual(['근거 없음 근거 있음[^1]']);
    expect(numbered.removed).toBe(1);
  });
});

describe('formatFootnote', () => {
  it('writes file name, quote, page and paragraph', () => {
    expect(
      formatFootnote({ filename: 'b.pdf', evidence: { quote: '12%', page: 2, paragraph: 3 } }),
    ).toBe('b.pdf · 「12%」 · 2쪽 3번째 문단');
  });
});
