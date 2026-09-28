import JSZip from 'jszip';
import { Types } from 'mongoose';
import { Readable } from 'stream';
import type { Response } from 'express';
import type { ExportSkill, SkillExportDeps, SkillPackExportDeps } from './export';
import type { ServerRequest } from '~/types';
import {
  pluginFiles,
  createPluginZip,
  createSkillExportHandler,
  createSkillPackExportHandler,
} from './export';

function makeSkill(overrides: Partial<ExportSkill> = {}): ExportSkill {
  return {
    _id: new Types.ObjectId(),
    name: 'weekly-report',
    displayTitle: '주간보고 작성',
    description: '팀 주간보고를 양식에 맞춰 씁니다.',
    body: '# 주간보고 작성\n\n금주 실적을 정리한다.\n',
    frontmatter: { metadata: { output: 'report', connectors: ['jira'] } },
    authorName: '김담당',
    version: 3,
    ...overrides,
  };
}

async function unzip(buffer: Buffer): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = new Map<string, string>();
  for (const file of Object.values(zip.files)) {
    if (!file.dir) {
      entries.set(file.name, await file.async('string'));
    }
  }
  return entries;
}

function createResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
    send: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
}

function fileStrategies(contents: Record<string, string>): SkillExportDeps['getStrategyFunctions'] {
  return ((source: string) =>
    source === 'local'
      ? {
          getDownloadStream: jest.fn(async (_req: unknown, filepath: string) =>
            Readable.from([Buffer.from(contents[filepath] ?? '')]),
          ),
        }
      : {}) as unknown as SkillExportDeps['getStrategyFunctions'];
}

describe('pluginFiles', () => {
  it('lays out a Claude plugin: manifest, SKILL.md per skill, bundled files, .mcp.json, README', () => {
    const skill = makeSkill();
    const files = pluginFiles(
      {
        slug: 'weekly-report',
        name: '주간보고 작성',
        description: 'd',
        author: '김담당',
        version: '0.3.0',
      },
      [
        {
          skill,
          files: [{ relativePath: 'references/template.md', content: Buffer.from('양식') }],
        },
      ],
    );

    expect(files.map((file) => file.path)).toEqual([
      '.claude-plugin/plugin.json',
      'skills/weekly-report/SKILL.md',
      'skills/weekly-report/references/template.md',
      '.mcp.json',
      'README.md',
    ]);
    expect(JSON.parse(String(files[0].content))).toEqual({
      name: 'weekly-report',
      version: '0.3.0',
      description: 'd',
      author: { name: '김담당' },
    });
    expect(JSON.parse(String(files[3].content))).toEqual({ mcpServers: { jira: {} } });
  });

  it('writes SKILL.md with name and description in the frontmatter above the stored body', () => {
    const [, skillMd] = pluginFiles(
      { slug: 's', name: 'n', description: '', author: '', version: '0.1.0' },
      [{ skill: makeSkill(), files: [] }],
    );

    expect(String(skillMd.content)).toBe(
      [
        '---',
        'name: weekly-report',
        'description: 팀 주간보고를 양식에 맞춰 씁니다.',
        'metadata:',
        '  output: report',
        '  connectors:',
        '    - jira',
        '---',
        '',
        '# 주간보고 작성',
        '',
        '금주 실적을 정리한다.',
        '',
      ].join('\n'),
    );
  });

  it('drops bundled files whose path would leave the skill folder', () => {
    const files = pluginFiles(
      { slug: 's', name: 'n', description: '', author: '', version: '0.1.0' },
      [
        {
          skill: makeSkill({ frontmatter: {} }),
          files: [
            { relativePath: '../escape.md', content: Buffer.from('x') },
            { relativePath: '/etc/passwd', content: Buffer.from('x') },
            { relativePath: 'a/./b.md', content: Buffer.from('x') },
            { relativePath: 'ok.md', content: Buffer.from('x') },
          ],
        },
      ],
    );

    expect(files.map((file) => file.path)).toEqual([
      '.claude-plugin/plugin.json',
      'skills/weekly-report/SKILL.md',
      'skills/weekly-report/ok.md',
      'README.md',
    ]);
  });

  it('skips a skill whose name cannot be a folder name', () => {
    const files = pluginFiles(
      { slug: 's', name: 'n', description: '', author: '', version: '0.1.0' },
      [{ skill: makeSkill({ name: '../evil', frontmatter: {} }), files: [] }],
    );

    expect(files.map((file) => file.path)).toEqual(['.claude-plugin/plugin.json', 'README.md']);
  });
});

describe('createSkillExportHandler', () => {
  it('sends a zip holding the skill and its stored files', async () => {
    const skill = makeSkill();
    const deps: SkillExportDeps = {
      getSkillById: jest.fn().mockResolvedValue(skill),
      listSkillFiles: jest.fn().mockResolvedValue([
        {
          relativePath: 'references/template.md',
          filepath: '/uploads/template.md',
          source: 'local',
        },
      ]),
      getStrategyFunctions: fileStrategies({ '/uploads/template.md': '# 결과물 양식' }),
    };
    const res = createResponse();
    const req = { params: { id: skill._id.toString() }, user: { id: 'u1' } };

    await createSkillExportHandler(deps)(
      req as unknown as ServerRequest,
      res as unknown as Response,
    );

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="weekly-report.zip"; filename*=UTF-8\'\'weekly-report.zip',
    );
    const entries = await unzip(res.send.mock.calls[0][0]);
    expect([...entries.keys()]).toEqual([
      '.claude-plugin/plugin.json',
      'skills/weekly-report/SKILL.md',
      'skills/weekly-report/references/template.md',
      '.mcp.json',
      'README.md',
    ]);
    expect(entries.get('skills/weekly-report/references/template.md')).toBe('# 결과물 양식');
    expect(JSON.parse(entries.get('.claude-plugin/plugin.json') ?? '')).toMatchObject({
      name: 'weekly-report',
      version: '0.3.0',
      author: { name: '김담당' },
    });
  });

  it('answers 404 when the skill is gone', async () => {
    const deps: SkillExportDeps = {
      getSkillById: jest.fn().mockResolvedValue(null),
      listSkillFiles: jest.fn(),
      getStrategyFunctions: fileStrategies({}),
    };
    const res = createResponse();

    await createSkillExportHandler(deps)(
      { params: { id: 'x' }, user: { id: 'u1' } } as unknown as ServerRequest,
      res as unknown as Response,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(deps.listSkillFiles).not.toHaveBeenCalled();
  });
});

describe('createSkillPackExportHandler', () => {
  it('bundles only the skills the requester can view, in pack order', async () => {
    const first = makeSkill({ name: 'first-skill', frontmatter: {} });
    const hidden = makeSkill({ name: 'hidden-skill', frontmatter: {} });
    const second = makeSkill({ name: 'second-skill', frontmatter: {} });
    const packId = new Types.ObjectId();
    const skills = new Map([first, hidden, second].map((skill) => [skill._id.toString(), skill]));
    const deps: SkillPackExportDeps = {
      getSkillPackById: jest.fn().mockResolvedValue({
        name: '분기 팩',
        slug: 'quarterly-pack',
        description: '분기 업무 모음',
        authorName: '박작성',
        skillIds: [second._id, hidden._id, first._id],
      }),
      findViewableSkillIds: jest
        .fn()
        .mockResolvedValue(new Set([first._id.toString(), second._id.toString()])),
      getSkillById: jest.fn(async (id) => skills.get(String(id)) ?? null),
      listSkillFiles: jest.fn().mockResolvedValue([]),
      getStrategyFunctions: fileStrategies({}),
    };
    const res = createResponse();

    await createSkillPackExportHandler(deps)(
      { params: { id: packId.toString() }, user: { id: 'u1' } } as unknown as ServerRequest,
      res as unknown as Response,
    );

    const entries = await unzip(res.send.mock.calls[0][0]);
    expect([...entries.keys()]).toEqual([
      '.claude-plugin/plugin.json',
      'skills/second-skill/SKILL.md',
      'skills/first-skill/SKILL.md',
      'README.md',
    ]);
    expect(deps.getSkillById).not.toHaveBeenCalledWith(hidden._id);
    expect(entries.get('README.md')).toContain('| skills/second-skill |');
  });

  it('answers 404 for a malformed or missing pack id', async () => {
    const deps: SkillPackExportDeps = {
      getSkillPackById: jest.fn().mockResolvedValue(null),
      findViewableSkillIds: jest.fn().mockResolvedValue(new Set()),
      getSkillById: jest.fn(),
      listSkillFiles: jest.fn(),
      getStrategyFunctions: fileStrategies({}),
    };
    for (const id of ['not-an-id', new Types.ObjectId().toString()]) {
      const res = createResponse();
      await createSkillPackExportHandler(deps)(
        { params: { id }, user: { id: 'u1' } } as unknown as ServerRequest,
        res as unknown as Response,
      );
      expect(res.status).toHaveBeenCalledWith(404);
    }
    expect(deps.getSkillPackById).toHaveBeenCalledTimes(1);
  });
});

describe('createPluginZip', () => {
  it('keeps binary files byte for byte', async () => {
    const bytes = Buffer.from([0, 255, 10, 13, 128]);
    const zip = await JSZip.loadAsync(await createPluginZip([{ path: 'a.bin', content: bytes }]));
    expect(Buffer.from(await zip.file('a.bin')!.async('uint8array'))).toEqual(bytes);
  });
});
