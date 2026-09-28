import { attachFiles, skillFilePath, syncSkillFiles, hasUnsyncedFiles } from '../files';
import { createBuilderState } from '../state';
import { toMarkdown } from '../markdown';

const doc = (name: string, text = 'x') => new File([text], name);

describe('attached documents', () => {
  it('sorts documents by name into one template, up to three samples, and references', () => {
    const state = attachFiles(createBuilderState(), [
      doc('출장보고 양식.hwpx'),
      doc('두번째 서식.hwpx'),
      doc('용어 가이드.pdf'),
      doc('a.txt'),
      doc('b.txt'),
      doc('c.txt'),
      doc('d.txt'),
    ]);
    expect(state.files.map(({ name, kind }) => [name, kind])).toEqual([
      ['출장보고 양식.hwpx', 'assets'],
      ['두번째 서식.hwpx', 'examples'],
      ['용어 가이드.pdf', 'references'],
      ['a.txt', 'examples'],
      ['b.txt', 'examples'],
      ['c.txt', 'references'],
      ['d.txt', 'references'],
    ]);
  });

  it('keeps one entry per name when the same document is picked again', () => {
    const once = attachFiles(createBuilderState(), [doc('a.txt', 'old')]);
    const twice = attachFiles(once, [doc('a.txt', 'new')]);
    expect(twice.files).toHaveLength(1);
    expect(twice.files[0].upload?.size).toBe(3);
  });

  it('turns any document name into a path the skill file API accepts', () => {
    const accepted = /^[a-zA-Z0-9._\-/]+$/;
    const taken = new Set<string>();
    const first = skillFilePath('examples', '출장 메모 1.txt', taken);
    taken.add(first);
    const second = skillFilePath('examples', '출장 메모 1.txt', taken);
    expect(first).toBe('examples/1.txt');
    expect(second).toBe('examples/1-2.txt');
    expect(skillFilePath('assets', '양식.hwpx', new Set())).toBe('assets/doc.hwpx');
    expect(skillFilePath('references', 'Guide v2.PDF', new Set())).toBe('references/Guide-v2.PDF');
    for (const path of [first, second]) {
      expect(path).toMatch(accepted);
    }
  });

  it('points SKILL.md at the stored documents under the skill folder', () => {
    const state = {
      ...attachFiles(createBuilderState(), [doc('출장보고 양식.hwpx'), doc('지난 출장.txt')]),
      slug: 'trip-report',
    };
    const markdown = toMarkdown(state);
    expect(markdown).toContain('- 양식: skills/trip-report/assets/doc.hwpx (출장보고 양식.hwpx)');
    expect(markdown).toContain('- 예시 문서: skills/trip-report/examples/doc.txt (지난 출장.txt)');
    expect(markdown).toContain('read_file');
  });

  it('leaves out documents that only have a name and no content to store', () => {
    const state = {
      ...createBuilderState(),
      slug: 'trip-report',
      files: [{ name: '대화 문서.pdf', kind: 'examples' as const }],
    };
    expect(toMarkdown(state)).not.toContain('대화 문서.pdf');
  });

  it('uploads new documents once and removes the ones taken off', async () => {
    const upload = jest.fn(async () => undefined);
    const remove = jest.fn(async () => undefined);
    const stored = new Map<string, File>();
    const state = attachFiles(createBuilderState(), [doc('지난 출장.txt', '출장 내용')]);

    expect(await syncSkillFiles(state.files, stored, { skillId: 's1', upload, remove })).toBe(true);
    expect(upload).toHaveBeenCalledWith({
      skillId: 's1',
      relativePath: 'examples/doc.txt',
      file: state.files[0].upload,
    });
    expect([...stored.keys()]).toEqual(['examples/doc.txt']);

    expect(await syncSkillFiles(state.files, stored, { skillId: 's1', upload, remove })).toBe(
      false,
    );
    expect(upload).toHaveBeenCalledTimes(1);

    const replaced = attachFiles(state, [doc('지난 출장.txt', '고친 내용')]);
    expect(await syncSkillFiles(replaced.files, stored, { skillId: 's1', upload, remove })).toBe(
      true,
    );
    expect(upload).toHaveBeenLastCalledWith({
      skillId: 's1',
      relativePath: 'examples/doc.txt',
      file: replaced.files[0].upload,
    });

    expect(await syncSkillFiles([], stored, { skillId: 's1', upload, remove })).toBe(true);
    expect(remove).toHaveBeenCalledWith({ skillId: 's1', relativePath: 'examples/doc.txt' });
    expect(stored.size).toBe(0);
  });

  it('notices a document whose content changed under the same name before saving again', async () => {
    const noop = jest.fn(async () => undefined);
    const stored = new Map<string, File>();
    const state = attachFiles(createBuilderState(), [doc('지난 출장.txt', '출장 내용')]);
    expect(hasUnsyncedFiles(state.files, stored)).toBe(true);

    await syncSkillFiles(state.files, stored, { skillId: 's1', upload: noop, remove: noop });
    expect(hasUnsyncedFiles(state.files, stored)).toBe(false);

    const replaced = attachFiles(state, [doc('지난 출장.txt', '고친 내용')]);
    expect(hasUnsyncedFiles(replaced.files, stored)).toBe(true);
    expect(hasUnsyncedFiles([], stored)).toBe(true);
  });
});
