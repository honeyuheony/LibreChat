import { load } from 'js-yaml';
import type { TSkill, TSkillDraft } from 'librechat-data-provider';
import {
  isTested,
  editField,
  applyDraft,
  todoItems,
  toMarkdown,
  pluginFiles,
  composeSteps,
  toSavePayload,
  splitSentences,
  isPublishReady,
  contentSignature,
  createBuilderState,
} from '../state';

const draft: TSkillDraft = {
  slug: 'trip-report',
  title: '출장보고 작성',
  description: '해외 출장 메모를 출장보고 양식으로 작성',
  triggers: ['출장'],
  output: 'report',
  extras: [],
  fields: ['출장 목적', '주요 결과'],
  icon: '✈️',
  steps: ['요청한 형식에 맞춰 작성한다.', '문서에 없는 내용은 만들지 않는다.'],
  connectors: [],
  fileKinds: [],
  origin: 'rules',
};

const text = '해외 출장 메모를 출장보고 양식으로 만든다.\n환율은 출장일 기준으로 적는다.';

describe('builder state', () => {
  it('splits sentences on line breaks and sentence ends and drops leading numbers', () => {
    expect(splitSentences('1. 첫째 할 일. 둘째 규칙!\n2) 셋째')).toEqual([
      '첫째 할 일.',
      '둘째 규칙!',
      '셋째',
    ]);
  });

  it('fills every AI-writable field from the draft and marks it as AI', () => {
    const next = applyDraft(createBuilderState(text), draft);
    expect(next.values.title).toBe('출장보고 작성');
    expect(next.sources.title).toBe('ai');
    expect(next.slug).toBe('trip-report');
  });

  it('keeps a field the person edited when a later draft arrives', () => {
    const edited = editField(
      applyDraft(createBuilderState(text), draft),
      'title',
      '우리 팀 출장보고',
    );
    const next = applyDraft(edited, { ...draft, title: '다른 이름' });
    expect(next.values.title).toBe('우리 팀 출장보고');
    expect(next.sources.title).toBe('me');
  });

  it('keeps imported values such as 원본 그대로', () => {
    const imported = { ...createBuilderState(text), sources: { title: '원본 그대로' } };
    imported.values = { ...imported.values, title: '원본 이름' };
    expect(applyDraft(imported, draft).values.title).toBe('원본 이름');
  });

  it('puts AI steps before the sentences after the first and skips removed or duplicate ones', () => {
    const state = {
      ...applyDraft(createBuilderState(`${text}\n문서에 없는 내용은 만들지 않는다`), draft),
      aiOff: ['요청한 형식에 맞춰 작성한다.'],
    };
    expect(composeSteps(state)).toEqual([
      { text: '환율은 출장일 기준으로 적는다.', by: 'me' },
      { text: '문서에 없는 내용은 만들지 않는다', by: 'me' },
    ]);
  });

  it('writes the frontmatter and numbered steps into SKILL.md', () => {
    const markdown = toMarkdown(applyDraft(createBuilderState(text), draft));
    const frontmatter = load(markdown.split('---')[1]) as Record<string, unknown>;
    expect(frontmatter).toMatchObject({
      name: 'trip-report',
      title: '출장보고 작성',
      examples: ['출장 시작해줘'],
      metadata: { icon: '✈️', triggers: ['출장'], output: 'report' },
    });
    expect(markdown).toContain('1. 요청한 형식에 맞춰 작성한다.');
    expect(markdown).toContain('3. 환율은 출장일 기준으로 적는다.');
    expect(markdown).toContain('- 문서에서 뽑을 항목: 출장 목적, 주요 결과');
  });

  it('sends the body without frontmatter and keeps the editor record', () => {
    const payload = toSavePayload({
      ...applyDraft(createBuilderState(text), draft),
      manualMinutes: 30,
    });
    expect(payload.body.startsWith('# 출장보고 작성')).toBe(true);
    expect(payload.manualMinutes).toBe(30);
    expect(payload.builder).toEqual({
      text,
      direct: false,
      sources: expect.any(Object),
      aiOff: [],
    });
  });

  it('falls back to the first sentence for the description before any draft arrives', () => {
    const payload = toSavePayload(createBuilderState(text));
    expect(payload.description).toBe('해외 출장 메모를 출장보고 양식으로 만든다.');
    expect(payload.frontmatter?.description).toBe('해외 출장 메모를 출장보고 양식으로 만든다.');
  });

  it('lists the plugin folder with SKILL.md under skills/<slug>', () => {
    const paths = pluginFiles(applyDraft(createBuilderState(text), draft), '홍길동').map(
      (file) => file.path,
    );
    expect(paths).toEqual([
      '.claude-plugin/plugin.json',
      'skills/trip-report/SKILL.md',
      'README.md',
    ]);
  });

  it('requires text with a name, the manual minutes and a passed test before publishing', () => {
    const state = applyDraft(createBuilderState(text), draft);
    expect(todoItems(state, false).map((item) => item.done)).toEqual([true, false, false]);
    expect(isPublishReady({ ...state, manualMinutes: 30 }, false)).toBe(false);
    expect(isPublishReady({ ...state, manualMinutes: 30 }, true)).toBe(true);
    expect(isPublishReady({ ...state, text: ' ', manualMinutes: 30 }, true)).toBe(false);
  });

  it('counts a test only for the current version and only while nothing changed since saving', () => {
    const skill = { version: 3, lastTest: { version: 3 } } as TSkill;
    expect(isTested(skill, false)).toBe(true);
    expect(isTested(skill, true)).toBe(false);
    expect(isTested({ ...skill, version: 4 }, false)).toBe(false);
  });

  it('ignores the sharing scope when comparing saved content', () => {
    const state = applyDraft(createBuilderState(text), draft);
    expect(contentSignature({ ...state, scope: 'me' })).toBe(contentSignature(state));
    expect(contentSignature({ ...state, text: `${text} 더` })).not.toBe(contentSignature(state));
  });
});
