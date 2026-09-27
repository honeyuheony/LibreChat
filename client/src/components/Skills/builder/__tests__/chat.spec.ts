import type { TSkillDraft, TaskDocResult, TaskTableResult } from 'librechat-data-provider';
import {
  SOURCE_AI,
  SOURCE_CHAT,
  SOURCE_ME,
  applyDraft,
  editField,
  toggleConnector,
} from '../state';
import { chatConfirmed, chatState } from '../chat';

const stats = { docs: 4, reflected: 4, none: 0, low: 0, textOnly: 0, cached: 0, seconds: 10 };
const row = (filename: string) => ({
  file_id: filename,
  filename,
  parse: 'ok' as const,
  cells: [],
});

const table: TaskTableResult = {
  kind: 'table',
  resultId: 'result-1',
  conversationId: 'convo-1',
  title: '비교표 · 4건',
  fields: ['정세 전망', '전월 대비', '주요 인물'],
  rows: [row('a.hwp'), row('b.pdf'), row('a.hwp'), row('c.docx'), row('d.pdf')],
  stats,
  extractor: { promptVersion: 'v3', model: 'm' },
  createdAt: '2026-09-27T00:00:00Z',
};

const summary: TaskDocResult = {
  kind: 'summary',
  resultId: 'result-2',
  conversationId: 'convo-1',
  title: '통합 요약',
  body: '',
  footnotes: [
    { n: 1, file_id: 'f1', filename: 'x.pdf', evidence: { quote: '' } },
    { n: 2, file_id: 'f2', filename: 'y.hwp', evidence: { quote: '' } },
  ],
  stats,
  createdAt: '2026-09-27T00:00:00Z',
};

const draft: TSkillDraft = {
  slug: 'weekly-trend',
  title: 'AI 가 지은 이름',
  description: '동향 문서를 비교한다',
  triggers: ['동향'],
  output: 'report',
  extras: [],
  fields: ['AI 항목'],
  icon: '📊',
  steps: [],
  connectors: ['jira'],
  fileKinds: [],
  origin: 'model',
};

const request = '국가별 동향 문서에서 정세 전망을 뽑아 비교표로 만들어 줘';

describe('chat entry', () => {
  it('reads the output kind, fields and up to three documents from a table result', () => {
    expect(chatConfirmed(table)).toEqual({
      output: 'organize',
      fields: ['정세 전망', '전월 대비', '주요 인물'],
      files: ['a.hwp', 'b.pdf', 'c.docx'],
    });
  });

  it('reads the documents of a summary from its footnotes and has no fields', () => {
    expect(chatConfirmed(summary)).toEqual({
      output: 'summary',
      fields: [],
      files: ['x.pdf', 'y.hwp'],
    });
  });

  it('fills the confirmed cells with the chat source and files the documents as examples', () => {
    const state = chatState(request, { ...chatConfirmed(table), connectors: ['confluence'] });

    expect(state.text).toBe(request);
    expect(state.values.output).toBe('organize');
    expect(state.values.fields).toEqual(['정세 전망', '전월 대비', '주요 인물']);
    expect(state.values.title).toBe('정세 전망·전월 대비 비교표');
    expect(state.values.connectors).toEqual(['confluence']);
    expect(state.sources).toEqual({
      output: SOURCE_CHAT,
      fields: SOURCE_CHAT,
      title: SOURCE_CHAT,
      connectors: SOURCE_CHAT,
    });
    expect(state.files).toEqual([
      { name: 'a.hwp', kind: 'examples' },
      { name: 'b.pdf', kind: 'examples' },
      { name: 'c.docx', kind: 'examples' },
    ]);
  });

  it('leaves the cells the conversation did not settle to the AI draft', () => {
    const state = chatState(request, { output: 'summary', fields: [], files: [], connectors: [] });

    expect(state.sources).toEqual({ output: SOURCE_CHAT });
    expect(state.values.title).toBe('');
    expect(state.values.connectors).toEqual([]);
  });

  it('keeps the confirmed cells when the AI draft arrives', () => {
    const state = applyDraft(
      chatState(request, { ...chatConfirmed(table), connectors: ['confluence'] }),
      draft,
    );

    expect(state.values.output).toBe('organize');
    expect(state.values.fields).toEqual(['정세 전망', '전월 대비', '주요 인물']);
    expect(state.values.title).toBe('정세 전망·전월 대비 비교표');
    expect(state.values.connectors).toEqual(['confluence']);
    expect(state.values.description).toBe('동향 문서를 비교한다');
    expect(state.sources.description).toBe(SOURCE_AI);
    expect(state.recommended).toEqual(['jira']);
  });

  it('marks a confirmed cell as the person’s own once they change it', () => {
    const state = chatState(request, { ...chatConfirmed(table), connectors: ['confluence'] });

    expect(editField(state, 'fields', ['정세 전망']).sources.fields).toBe(SOURCE_ME);
    expect(toggleConnector(state, 'jira').sources.connectors).toBe(SOURCE_ME);
  });

  it('does not tag connectors on a fresh editor when one is switched on', () => {
    const state = chatState(request, { output: 'summary', fields: [], files: [], connectors: [] });

    expect(toggleConnector(state, 'jira').sources.connectors).toBeUndefined();
  });
});
