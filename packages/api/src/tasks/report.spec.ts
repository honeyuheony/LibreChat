import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import type { ReportTemplate } from './report';
import { assembleCodeSlots, composeReport, fillTitle, loadReportTemplate } from './report';
import { documentName, fakeLLM, makeDoc, memoryCache } from './__tests__/fakes.helper';
import { extractFields, normalizeFields } from './extract';

const briefing: ReportTemplate = {
  templateId: 'nk-weekly-briefing',
  title: '북한 정세 주간 브리핑 ({{주차}})',
  fields: ['분야', '주요 동향', '전월 대비', '시사점', '위험 요인', '정세 전망'],
  slots: [
    { id: '요약', kind: 'paragraph', placeholder: '{{요약}}' },
    {
      id: '분야별 동향',
      kind: 'table_fixed_rows',
      label: '분야',
      rows: ['정치', '군사', '경제', '사회', '대외'],
      columns: { '주요 동향': '주요 동향', '전월 대비': '전월 대비', 시사점: '시사점' },
      rowField: '분야',
    },
    { id: '위험 요인', kind: 'list', field: '위험 요인' },
    { id: '전망', kind: 'paragraph', placeholder: '{{전망}}', from: ['정세 전망'] },
    { id: '참고 자료', kind: 'list', source: 'filenames' },
  ],
};

const weekly: ReportTemplate = {
  templateId: 'weekly-report',
  title: '{{팀}} 주간보고 ({{기간}})',
  fields: ['담당', '금주 실적', '차주 계획', '상태', '이슈'],
  slots: [
    {
      id: '금주 실적',
      kind: 'table_rows',
      columns: { 담당: '담당', 업무: '금주 실적', 상태: '상태', 비고: '@filename' },
      defaults: { 담당: '미정', 상태: '미정' },
    },
    { id: '이슈', kind: 'list', field: '이슈' },
  ],
};

const briefingDocs = [
  makeDoc('f1', '정치 분야: 9.9절 행사 간소화. 전월 대비 감소. 위험: 식량난 심화.', 'pol.hwp'),
  makeDoc('f2', '경제 분야 동향: 시장 환율 급등 확인.', 'eco.hwpx'),
];

const briefingAnswers: Record<string, unknown> = {
  'pol.hwp': {
    분야: { value: '정치', quote: '정치 분야' },
    '주요 동향': { value: '9.9절 행사 간소화', quote: '9.9절 행사 간소화' },
    '전월 대비': { value: '감소', quote: '전월 대비 감소' },
    시사점: { value: null, quote: null },
    '위험 요인': { value: '식량난 심화', quote: '위험: 식량난 심화' },
    '정세 전망': { value: null, quote: null },
  },
  'eco.hwpx': {
    분야: { value: '경제', quote: '경제 분야' },
    '주요 동향': { value: '환율 급등', quote: '시장 환율 급등' },
    '전월 대비': { value: null, quote: null },
    시사점: { value: null, quote: null },
    '위험 요인': { value: '환율 불안', quote: '본문에 없는 인용' },
    '정세 전망': { value: null, quote: null },
  },
};

async function extractBriefing() {
  const fields = normalizeFields(briefing.fields);
  const { llm } = fakeLLM((prompt) => briefingAnswers[documentName(prompt)]);
  const rows = await extractFields({ docs: briefingDocs, fields, llm, cache: memoryCache() });
  return { fields, rows };
}

describe('fillTitle', () => {
  it('fills known placeholders and drops unknown ones with their empty brackets', () => {
    expect(fillTitle(weekly.title, { 팀: '정세분석팀' })).toBe('정세분석팀 주간보고');
    expect(fillTitle(briefing.title, { 주차: '9월 3주차' })).toBe(
      '북한 정세 주간 브리핑 (9월 3주차)',
    );
  });
});

describe('assembleCodeSlots', () => {
  it('fills fixed rows by the row label field and leaves rows without values empty', async () => {
    const { fields, rows } = await extractBriefing();
    const content = assembleCodeSlots(briefing, fields, rows);
    const table = content.fixedTables['분야별 동향'];
    expect(table['정치']).toEqual({
      '주요 동향': '9.9절 행사 간소화[^c1_2]',
      '전월 대비': '감소[^c1_3]',
      시사점: null,
    });
    expect(table['경제']['주요 동향']).toBe('환율 급등[^c2_2]');
    expect(table['군사']).toEqual({ '주요 동향': null, '전월 대비': null, 시사점: null });
  });

  it('cites only verified values in lists and lists every file name for source slots', async () => {
    const { fields, rows } = await extractBriefing();
    const content = assembleCodeSlots(briefing, fields, rows);
    expect(content.paragraphs['위험 요인']).toEqual(['식량난 심화[^c1_5]', '환율 불안']);
    expect(content.paragraphs['참고 자료']).toEqual(['pol.hwp', 'eco.hwpx']);
  });

  it('adds one table row per document and leaves missing columns to template defaults', async () => {
    const docs = [makeDoc('w1', '김 사무관: 정세 분석 보고서 작성 완료', 'kim.hwp')];
    const { llm } = fakeLLM(() => ({
      담당: { value: '김 사무관', quote: '김 사무관' },
      '금주 실적': { value: '정세 분석 보고서 작성', quote: '정세 분석 보고서 작성' },
      '차주 계획': { value: null, quote: null },
      상태: { value: null, quote: null },
      이슈: { value: null, quote: null },
    }));
    const fields = normalizeFields(weekly.fields);
    const rows = await extractFields({ docs, fields, llm, cache: memoryCache() });
    expect(assembleCodeSlots(weekly, fields, rows).rowTables['금주 실적']).toEqual([
      { 담당: '김 사무관[^c1_1]', 업무: '정세 분석 보고서 작성[^c1_2]', 비고: 'kim.hwp' },
    ]);
  });
  it('skips a document in a row table when the column named after the slot has no value', async () => {
    const plan: ReportTemplate = {
      ...weekly,
      slots: [
        {
          id: '차주 계획',
          kind: 'table_rows',
          columns: { 담당: '담당', 업무: '차주 계획', 비고: '@filename' },
        },
      ],
    };
    const docs = [makeDoc('w1', '김 사무관', 'kim.hwp')];
    const { llm } = fakeLLM(() => ({
      담당: { value: '김 사무관', quote: '김 사무관' },
      '차주 계획': { value: null, quote: null },
    }));
    const fields = normalizeFields(plan.fields);
    const rows = await extractFields({ docs, fields, llm, cache: memoryCache() });
    expect(assembleCodeSlots(plan, fields, rows).rowTables['차주 계획']).toEqual([]);
  });
});

describe('composeReport', () => {
  it('numbers footnotes across slots, keeps render footnotes equal to result footnotes', async () => {
    const { fields, rows } = await extractBriefing();
    const writer = fakeLLM(() => ({
      paragraphs: { 요약: '정치 행사가 줄었다.[^c1_2] 없는 근거[^c7_7]', 전망: '' },
      title_values: { 주차: '9월 3주차' },
    }));
    const { result, render } = await composeReport({
      resultId: 'r1',
      conversationId: 'c1',
      template: briefing,
      fields,
      rows,
      llm: writer.llm,
      startedAt: 0,
      now: () => 5_000,
    });
    expect(render.paragraphs['요약']).toBe('정치 행사가 줄었다.[^1] 없는 근거');
    expect(render.tables['분야별 동향']).toMatchObject({
      정치: { '주요 동향': '9.9절 행사 간소화[^2]', '전월 대비': '감소[^3]' },
      경제: { '주요 동향': '환율 급등[^4]' },
    });
    expect(render.paragraphs['위험 요인']).toEqual(['식량난 심화[^5]', '환율 불안']);
    expect(render.footnotes.map((note) => note.n)).toEqual([1, 2, 3, 4, 5]);
    expect(render.footnotes).toHaveLength(result.footnotes.length);
    expect(render.footnotes[0].text).toBe('pol.hwp · 「9.9절 행사 간소화」 · 1번째 문단');
    expect(render.values).toEqual({ 주차: '9월 3주차' });
    expect(result.title).toBe('북한 정세 주간 브리핑 (9월 3주차) 초안');
    expect(result.stats.low).toBe(2);
    expect(writer.prompts).toHaveLength(1);
  });
});

describe('loadReportTemplate', () => {
  it('reads slots.json from <skillsDir>/<id>/assets', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'task-templates-'));
    await fs.mkdir(path.join(dir, 'weekly-report', 'assets'), { recursive: true });
    const { templateId: _id, ...slots } = weekly;
    await fs.writeFile(
      path.join(dir, 'weekly-report', 'assets', 'slots.json'),
      JSON.stringify(slots),
    );
    await expect(loadReportTemplate('weekly-report', dir)).resolves.toEqual(weekly);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('rejects ids that could leave the skills folder', async () => {
    await expect(loadReportTemplate(path.join('x', 'y'), os.tmpdir())).rejects.toThrow(
      'Unknown report template',
    );
  });
});
