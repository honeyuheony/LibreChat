import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import type { StoredFile, TaskRuntimeParams } from './runtime';
import { createTaskToolDeps, loadConversationDocuments } from './runtime';
import { initializeDeploymentSkills } from '~/skills/deployment';
import { hashText } from './documents';

const files: Array<StoredFile & { user: string }> = [
  { user: 'u1', file_id: 'a', filename: 'a.hwp', type: 'application/x-hwp', text: '가' },
  { user: 'u1', file_id: 'b', filename: 'b.pdf', type: 'application/pdf', text: '나' },
  { user: 'u1', file_id: 'img', filename: 'c.png', type: 'image/png' },
  { user: 'u2', file_id: 'other', filename: 'x.txt', type: 'text/plain', text: '남의 파일' },
  { user: 'u1', file_id: 'new', filename: 'd.txt', type: 'text/plain', text: '라' },
];

const messages = [
  { files: [{ file_id: 'b' }] },
  { files: [{ file_id: 'a' }, { file_id: 'other' }, { file_id: 'img' }] },
];

function deps(readPdf?: (file: StoredFile) => Promise<string[]>) {
  const queries: Array<Record<string, unknown>> = [];
  return {
    queries,
    getMessages: async (filter: Record<string, unknown>) => {
      queries.push(filter);
      return messages;
    },
    getFiles: async (filter: Record<string, unknown>) => {
      const ids = (filter.file_id as { $in: string[] }).$in;
      return files.filter((file) => ids.includes(file.file_id) && file.user === filter.user);
    },
    readPdf,
  };
}

describe('loadConversationDocuments', () => {
  it('returns the user files of the conversation in message order, skipping images', async () => {
    const env = deps(async () => ['1쪽', '2쪽']);
    const docs = await loadConversationDocuments({
      userId: 'u1',
      conversationId: 'c1',
      requestFileIds: ['new'],
      ...env,
    });
    expect(docs.map((doc) => doc.file_id)).toEqual(['b', 'a', 'new']);
    expect(env.queries).toEqual([{ conversationId: 'c1', user: 'u1' }]);
    expect((await docs[0].loadPages?.())?.pageStarts).toEqual([0, 3]);
  });

  it('does not download a PDF until its pages are asked for, and then only once', async () => {
    const readPdf = jest.fn(async () => ['1쪽', '2쪽']);
    const [pdf] = await loadConversationDocuments({
      userId: 'u1',
      conversationId: 'c1',
      fileIds: ['b'],
      ...deps(readPdf),
    });
    expect(readPdf).not.toHaveBeenCalled();
    expect(pdf.text).toBe('나');
    await Promise.all([pdf.loadPages?.(), pdf.loadPages?.()]);
    expect(readPdf).toHaveBeenCalledTimes(1);
  });

  it('lets file_ids narrow the conversation files but never add others', async () => {
    const docs = await loadConversationDocuments({
      userId: 'u1',
      conversationId: 'c1',
      fileIds: ['a', 'not-in-conversation'],
      ...deps(),
    });
    expect(docs.map((doc) => doc.file_id)).toEqual(['a']);
  });

  it('hashes a PDF the same way whether or not its pages are re-read', async () => {
    const [deferred] = await loadConversationDocuments({
      userId: 'u1',
      conversationId: 'c1',
      fileIds: ['b'],
      ...deps(async () => ['1쪽', '2쪽']),
    });
    const withPages = (await deferred.loadPages?.()) ?? deferred;
    const [storedOnly] = await loadConversationDocuments({
      userId: 'u1',
      conversationId: 'c1',
      fileIds: ['b'],
      ...deps(),
    });
    expect(withPages.textHash).toBe(storedOnly.textHash);
    expect(withPages.textHash).toBe(hashText('나'));
  });

  it('falls back to stored text marked text_only when PDF pages cannot be read', async () => {
    const docs = await loadConversationDocuments({
      userId: 'u1',
      conversationId: 'c1',
      ...deps(async () => {
        throw new Error('broken pdf');
      }),
    });
    const loaded = await docs[0].loadPages?.();
    expect(loaded).toMatchObject({ file_id: 'b', text: '나', parse: 'text_only' });
    expect(loaded?.pageStarts).toBeUndefined();
  });
});

describe('createTaskToolDeps loadTemplate', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'task-runtime-'));
    const assets = path.join(projectRoot, 'skill', 'hwp-report', 'assets');
    await fs.mkdir(assets, { recursive: true });
    await fs.mkdir(path.join(projectRoot, 'api'));
    await fs.writeFile(
      path.join(assets, 'slots.json'),
      JSON.stringify({ title: '보고서', fields: [], slots: [] }),
    );
    await fs.writeFile(
      path.join(projectRoot, 'skill', 'hwp-report', 'SKILL.md'),
      [
        '---',
        'name: hwp-report',
        'description: A deployment skill that owns the report templates.',
        'category: 문서작성',
        '---',
        '',
        '# hwp-report',
      ].join('\n'),
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  async function loadTeamTemplate(templateId: string, department?: string) {
    const skillDir = path.join(projectRoot, 'skill', 'hwp-report');
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: hwp-report',
        'description: A deployment skill that owns the report templates.',
        'category: 문서작성',
        'metadata:',
        '  department: "통일교육팀"',
        '  scope: 팀',
        '---',
        '',
        '# hwp-report',
      ].join('\n'),
    );
    await fs.writeFile(
      path.join(skillDir, 'assets', 'slots-general.json'),
      JSON.stringify({ title: '일반 보고서', fields: [], slots: [] }),
    );
    await initializeDeploymentSkills({ projectRoot, env: {} });
    const deps = createTaskToolDeps({
      req: { user: { id: 'u1', ...(department && { department }) }, body: {} },
      models: {},
    } as unknown as TaskRuntimeParams);
    return deps.loadTemplate(templateId);
  }

  it('loads the template of a team-scoped deployment skill for its department', async () => {
    await expect(loadTeamTemplate('hwp-report', '통일교육팀')).resolves.toMatchObject({
      templateId: 'hwp-report',
    });
  });

  it.each([
    ['another department', 'hwp-report', '운영지원팀'],
    ['a user without a department', 'hwp-report', undefined],
    ['a variant template of another department', 'hwp-report-general', '운영지원팀'],
  ])(
    'does not load a team-scoped deployment skill template for %s',
    async (_label, templateId, department) => {
      await expect(loadTeamTemplate(templateId, department)).rejects.toThrow(
        `Unknown report template "${templateId}".`,
      );
    },
  );

  it('does not load a template from a folder that no deployment skill owns', async () => {
    const assets = path.join(projectRoot, 'skill', 'orphan-template', 'assets');
    await fs.mkdir(assets, { recursive: true });
    await fs.writeFile(
      path.join(assets, 'slots.json'),
      JSON.stringify({ title: '주인 없는 서식', fields: [], slots: [] }),
    );
    await initializeDeploymentSkills({ projectRoot, env: {} });
    const deps = createTaskToolDeps({
      req: { user: { id: 'u1' }, body: {} },
      models: {},
    } as unknown as TaskRuntimeParams);
    await expect(deps.loadTemplate('orphan-template')).rejects.toThrow(
      'Unknown report template "orphan-template".',
    );
  });

  it('reads templates from the directory the deployment skills were loaded from, not the cwd', async () => {
    await initializeDeploymentSkills({ projectRoot, env: {} });
    // The container starts the server from <root>/api, while skills live in <root>/skill
    jest.spyOn(process, 'cwd').mockReturnValue(path.join(projectRoot, 'api'));
    const deps = createTaskToolDeps({
      req: { user: { id: 'u1' }, body: {} },
      models: {},
    } as unknown as TaskRuntimeParams);
    await expect(deps.loadTemplate('hwp-report')).resolves.toMatchObject({
      templateId: 'hwp-report',
      title: '보고서',
    });
  });
});
