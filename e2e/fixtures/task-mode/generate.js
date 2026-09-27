/**
 * 작업 모드 픽스처를 다시 만든다: `node e2e/fixtures/task-mode/generate.js`.
 * 올리는 본문, 가짜 모델의 답, spec 의 기댓값은 모두 documents.json 한 곳에서 나온다.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const OUT = __dirname;
const FIELDS = ['정세 전망', '전월 대비', '위험도', '출처 매체', '관련 지표'];

/** [filename, topic, 정세 전망, 전월 대비, 위험도, 출처 매체, 관련 지표]. null 은 문서에 그 값이 없다는 뜻이다. */
const rows = [
  [
    '2026-09-01_정치동향.txt',
    '정치',
    '지도부 행사 축소 기조 유지',
    '행사 횟수 20% 감소',
    '보통',
    '노동신문',
    '공개 행사 12회',
  ],
  [
    '2026-09-02_군사동향.txt',
    '군사',
    '단거리 발사체 시험 재개 가능성',
    '훈련 횟수 2회 증가',
    '높음',
    '조선중앙통신',
    '발사 징후 3건',
  ],
  [
    '2026-09-03_경제동향.txt',
    '경제',
    '곡물 가격 안정세',
    '쌀값 5% 하락',
    '낮음',
    '데일리NK',
    '쌀 1kg 5,800원',
  ],
  [
    '2026-09-04_사회동향.txt',
    '사회',
    '주민 이동 통제 강화',
    null,
    '보통',
    '자유아시아방송',
    '검문소 4곳 신설',
  ],
  [
    '2026-09-05_대외관계.txt',
    '대외',
    '중국과 교역 회복 흐름',
    '교역액 8% 증가',
    '낮음',
    '해관총서',
    null,
  ],
  [
    '2026-09-08_식량수급.txt',
    '식량',
    '가을 수확 뒤 일시 개선',
    '배급량 변동 없음',
    '보통',
    '세계식량계획',
    '작황 지수 102',
  ],
  [
    '2026-09-09_시장물가.txt',
    '물가',
    null,
    '환율 3% 상승',
    '보통',
    '아시아프레스',
    '달러 환율 8,300원',
  ],
  [
    '2026-09-10_북러협력.txt',
    '북러',
    '군사·경제 협력 확대',
    '고위급 교류 2회 증가',
    '높음',
    '타스통신',
    '방문단 3회',
  ],
  [
    '2026-09-11_인도지원.txt',
    '인도',
    '국제기구 지원 협의 정체',
    null,
    '보통',
    '유엔 인도지원조정국',
    '지원 사업 2건',
  ],
  [
    'sample_1.hwp',
    '종합',
    '당분간 현 정책 기조 유지',
    '특이 변화 없음',
    '보통',
    '통일부 정세 자료',
    '주요 회의 1회',
  ],
  ['sample_2.hwp', '국경', '국경 통제 완화 조짐', '통행 건수 15% 증가', '낮음', '연합뉴스', null],
  [
    '2026-09-18_추진계획.hwpx',
    '계획',
    '4분기 교류 사업 착수 예정',
    '예산 10% 증액',
    null,
    '내부 추진계획',
    '사업 5건',
  ],
];

const documents = rows.map(([filename, topic, ...values]) => {
  const fields = {};
  const sentences = [];
  FIELDS.forEach((field, index) => {
    const value = values[index];
    if (value == null) {
      fields[field] = null;
      return;
    }
    const quote = `${field}: ${value}.`;
    sentences.push(quote);
    fields[field] = { value, quote };
  });
  const firstParagraph = `${topic} 분야 정기 보고 문서다. 이 문서는 ${filename} 의 고정 시험 본문이다.`;
  const text = [firstParagraph, sentences.slice(0, 3).join(' '), sentences.slice(3).join(' ')]
    .filter((paragraph) => paragraph.length > 0)
    .join('\n\n');
  const [firstQuote] = sentences;
  return {
    filename,
    text,
    fields,
    summary: {
      summary: `${topic} 분야의 위험 요인을 정리했다. ${firstQuote}`,
      one_line: `${topic} 분야 위험 요인 한 줄 요약`,
      points: [{ text: `${topic} 핵심 위험`, quote: firstQuote }],
    },
  };
});

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'documents.json'),
  `${JSON.stringify({ fields: FIELDS, documents }, null, 2)}\n`,
);

/* HWP 5.0 파일은 Compound File Binary 서명으로 시작한다. 가짜 추출기는 나머지를 보지 않는다. */
const cfb = Buffer.alloc(512);
Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(cfb);
fs.writeFileSync(path.join(OUT, 'fixture.hwp'), cfb);

const zip = new JSZip();
zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
zip.file(
  'Contents/section0.xml',
  '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"/>',
);

/* mammoth 가 읽는 가장 작은 DOCX: content types, 패키지 관계, 문단 하나. */
const docx = new JSZip();
docx.file(
  '[Content_Types].xml',
  '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
);
docx.file(
  '_rels/.rels',
  '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
);
docx.file(
  'word/document.xml',
  '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>변환 서버와 관계없이 올라가는 시험 DOCX 문서다.</w:t></w:r></w:p></w:body></w:document>',
);

Promise.all([
  zip.generateAsync({ type: 'nodebuffer' }),
  docx.generateAsync({ type: 'nodebuffer' }),
]).then(([hwpx, docxBuffer]) => {
  fs.writeFileSync(path.join(OUT, 'fixture.hwpx'), hwpx);
  fs.writeFileSync(path.join(OUT, 'fixture.docx'), docxBuffer);
});
