import JSZip from 'jszip';
import express from 'express';
import request from 'supertest';
import { Types } from 'mongoose';
import { Readable } from 'stream';
import { logger } from '@librechat/data-schemas';
import type { ISkillFile } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { ExportSkill, SkillExportDeps, SkillPackExportDeps } from './export';
import type { ServerRequest } from '~/types';
import {
  pluginFiles,
  createPluginZip,
  createSkillExportHandler,
  skillExportLimits,
  createSkillPackExportHandler,
} from './export';

const NO_LIMITS = { maxFiles: 500, maxBytes: 500 * 1024 * 1024 };

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

function storedFile(relativePath: string, content: string): ISkillFile {
  return {
    relativePath,
    filepath: `/uploads/${relativePath}`,
    source: 'local',
    bytes: Buffer.byteLength(content),
  } as ISkillFile;
}

/** 파일이 열리고 끝나는 순서를 `events` 에 남기는 저장소. */
function recordingStorage(contents: Record<string, string>, events: string[] = []) {
  const getStrategyFunctions = ((source: string) =>
    source === 'local'
      ? {
          getDownloadStream: jest.fn(async (_req: unknown, filepath: string) => {
            events.push(`open ${filepath}`);
            const stream = Readable.from([Buffer.from(contents[filepath] ?? '')]);
            stream.on('end', () => events.push(`end ${filepath}`));
            return stream;
          }),
        }
      : {}) as unknown as SkillExportDeps['getStrategyFunctions'];
  return { getStrategyFunctions, events };
}

function binaryParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
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

function appWith(handler: (req: ServerRequest, res: Response) => Promise<unknown>) {
  const app = express();
  app.get('/export/:id', (req: Request, res: Response) => {
    (req as unknown as ServerRequest).user = { id: 'u1' } as ServerRequest['user'];
    void handler(req as unknown as ServerRequest, res);
  });
  return app;
}

function getZip(app: express.Express, id: string) {
  return request(app).get(`/export/${id}`).buffer(true).parse(binaryParser);
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

  it('drops bundled files that would leave the skill folder or replace SKILL.md', () => {
    const files = pluginFiles(
      { slug: 's', name: 'n', description: '', author: '', version: '0.1.0' },
      [
        {
          skill: makeSkill({ frontmatter: {} }),
          files: [
            { relativePath: '../escape.md', content: Buffer.from('x') },
            { relativePath: '/etc/passwd', content: Buffer.from('x') },
            { relativePath: 'a/./b.md', content: Buffer.from('x') },
            { relativePath: 'skill.md', content: Buffer.from('x') },
            { relativePath: 'Skill.MD', content: Buffer.from('x') },
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
  it('streams a zip holding the skill and its stored files', async () => {
    const skill = makeSkill();
    const deps: SkillExportDeps = {
      getSkillById: jest.fn().mockResolvedValue(skill),
      listSkillFiles: jest
        .fn()
        .mockResolvedValue([storedFile('references/template.md', '# 결과물 양식')]),
      getStrategyFunctions: recordingStorage({ '/uploads/references/template.md': '# 결과물 양식' })
        .getStrategyFunctions,
      getLimits: () => NO_LIMITS,
    };

    const res = await getZip(appWith(createSkillExportHandler(deps)), skill._id.toString());

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="weekly-report.zip"; filename*=UTF-8\'\'weekly-report.zip',
    );
    const entries = await unzip(res.body);
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

  it('opens stored files one at a time, each after the previous one has been read', async () => {
    const skill = makeSkill({ frontmatter: {} });
    const storage = recordingStorage({ '/uploads/a.md': 'a'.repeat(5000), '/uploads/b.md': 'b' });
    const deps: SkillExportDeps = {
      getSkillById: jest.fn().mockResolvedValue(skill),
      listSkillFiles: jest
        .fn()
        .mockResolvedValue([storedFile('a.md', 'a'.repeat(5000)), storedFile('b.md', 'b')]),
      getStrategyFunctions: storage.getStrategyFunctions,
      getLimits: () => NO_LIMITS,
    };

    const res = await getZip(appWith(createSkillExportHandler(deps)), skill._id.toString());

    expect(res.status).toBe(200);
    expect(storage.events).toEqual([
      'open /uploads/a.md',
      'end /uploads/a.md',
      'open /uploads/b.md',
      'end /uploads/b.md',
    ]);
  });

  it('reads a storage stream that only supports async iteration', async () => {
    const skill = makeSkill({ frontmatter: {} });
    const deps: SkillExportDeps = {
      getSkillById: jest.fn().mockResolvedValue(skill),
      listSkillFiles: jest.fn().mockResolvedValue([storedFile('a.md', 'iterated')]),
      getStrategyFunctions: (() => ({
        getDownloadStream: jest.fn(async () => ({
          on: jest.fn(),
          pipe: jest.fn(),
          [Symbol.asyncIterator]: async function* () {
            yield Buffer.from('iterated');
          },
        })),
      })) as unknown as SkillExportDeps['getStrategyFunctions'],
      getLimits: () => NO_LIMITS,
    };

    const res = await getZip(appWith(createSkillExportHandler(deps)), skill._id.toString());

    expect((await unzip(res.body)).get('skills/weekly-report/a.md')).toBe('iterated');
  });

  it('answers 413 without reading any file when the skill has too many files', async () => {
    const skill = makeSkill({ frontmatter: {} });
    const storage = recordingStorage({});
    const deps: SkillExportDeps = {
      getSkillById: jest.fn().mockResolvedValue(skill),
      listSkillFiles: jest
        .fn()
        .mockResolvedValue([storedFile('a.md', 'a'), storedFile('b.md', 'b')]),
      getStrategyFunctions: storage.getStrategyFunctions,
      getLimits: () => ({ maxFiles: 2, maxBytes: NO_LIMITS.maxBytes }),
    };

    const res = await request(appWith(createSkillExportHandler(deps))).get(
      `/export/${skill._id.toString()}`,
    );

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: 'Export is too large',
      maxFiles: 2,
      maxBytes: NO_LIMITS.maxBytes,
    });
    expect(storage.events).toEqual([]);
  });

  it('answers 413 when the stored files and SKILL.md add up to more bytes than allowed', async () => {
    const skill = makeSkill({ frontmatter: {}, body: '12345' });
    const storage = recordingStorage({});
    const deps: SkillExportDeps = {
      getSkillById: jest.fn().mockResolvedValue(skill),
      listSkillFiles: jest.fn().mockResolvedValue([storedFile('a.md', '123456')]),
      getStrategyFunctions: storage.getStrategyFunctions,
      getLimits: () => ({ maxFiles: NO_LIMITS.maxFiles, maxBytes: 10 }),
    };

    const res = await request(appWith(createSkillExportHandler(deps))).get(
      `/export/${skill._id.toString()}`,
    );

    expect(res.status).toBe(413);
    expect(storage.events).toEqual([]);
  });

  it('closes the connection and logs when a stored file fails while streaming', async () => {
    const skill = makeSkill({ frontmatter: {} });
    const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const deps: SkillExportDeps = {
      getSkillById: jest.fn().mockResolvedValue(skill),
      listSkillFiles: jest.fn().mockResolvedValue([storedFile('broken.md', 'x')]),
      getStrategyFunctions: (() => ({
        getDownloadStream: jest.fn(async () => {
          const stream = new Readable({ read() {} });
          setImmediate(() => stream.destroy(new Error('disk gone')));
          return stream;
        }),
      })) as unknown as SkillExportDeps['getStrategyFunctions'],
      getLimits: () => NO_LIMITS,
    };

    await expect(
      getZip(appWith(createSkillExportHandler(deps)), skill._id.toString()),
    ).rejects.toThrow();
    expect(logged).toHaveBeenCalledWith(
      '[GET /skills/:id/export] Error while streaming the export',
      expect.objectContaining({ message: 'disk gone' }),
    );
    logged.mockRestore();
  });

  it('answers 404 when the skill is gone', async () => {
    const deps: SkillExportDeps = {
      getSkillById: jest.fn().mockResolvedValue(null),
      listSkillFiles: jest.fn(),
      getStrategyFunctions: recordingStorage({}).getStrategyFunctions,
      getLimits: () => NO_LIMITS,
    };

    const res = await request(appWith(createSkillExportHandler(deps))).get('/export/x');

    expect(res.status).toBe(404);
    expect(deps.listSkillFiles).not.toHaveBeenCalled();
  });
});

describe('createSkillPackExportHandler', () => {
  function packDeps(skills: ExportSkill[], viewable: ExportSkill[], limits = NO_LIMITS) {
    const byId = new Map(skills.map((skill) => [skill._id.toString(), skill]));
    const deps: SkillPackExportDeps = {
      getSkillPackById: jest.fn().mockResolvedValue({
        name: '분기 팩',
        slug: 'quarterly-pack',
        description: '분기 업무 모음',
        authorName: '박작성',
        skillIds: skills.map((skill) => skill._id),
      }),
      findViewableSkillIds: jest
        .fn()
        .mockResolvedValue(new Set(viewable.map((skill) => skill._id.toString()))),
      getSkillById: jest.fn(async (id) => byId.get(String(id)) ?? null),
      listSkillFiles: jest.fn().mockResolvedValue([storedFile('a.md', 'a')]),
      getStrategyFunctions: recordingStorage({ '/uploads/a.md': 'a' }).getStrategyFunctions,
      getLimits: () => limits,
    };
    return deps;
  }

  it('bundles only the skills the requester can view, in pack order', async () => {
    const second = makeSkill({ name: 'second-skill', frontmatter: {} });
    const hidden = makeSkill({ name: 'hidden-skill', frontmatter: {} });
    const first = makeSkill({ name: 'first-skill', frontmatter: {} });
    const deps = packDeps([second, hidden, first], [first, second]);

    const res = await getZip(
      appWith(createSkillPackExportHandler(deps)),
      new Types.ObjectId().toString(),
    );

    const entries = await unzip(res.body);
    expect([...entries.keys()]).toEqual([
      '.claude-plugin/plugin.json',
      'skills/second-skill/SKILL.md',
      'skills/second-skill/a.md',
      'skills/first-skill/SKILL.md',
      'skills/first-skill/a.md',
      'README.md',
    ]);
    expect(deps.getSkillById).not.toHaveBeenCalledWith(hidden._id);
    expect(entries.get('README.md')).toContain('| skills/second-skill |');
  });

  it('counts files across every skill in the pack against the limit', async () => {
    const skills = [1, 2, 3].map((n) => makeSkill({ name: `skill-${n}`, frontmatter: {} }));
    const deps = packDeps(skills, skills, { maxFiles: 5, maxBytes: NO_LIMITS.maxBytes });

    const res = await request(appWith(createSkillPackExportHandler(deps))).get(
      `/export/${new Types.ObjectId().toString()}`,
    );

    expect(res.status).toBe(413);
  });

  it('answers 404 for a malformed or missing pack id', async () => {
    const deps = packDeps([], []);
    (deps.getSkillPackById as jest.Mock).mockResolvedValue(null);
    const app = appWith(createSkillPackExportHandler(deps));

    const malformed = await request(app).get('/export/not-an-id');
    const missing = await request(app).get(`/export/${new Types.ObjectId().toString()}`);

    expect(malformed.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(deps.getSkillPackById).toHaveBeenCalledTimes(1);
  });
});

describe('createPluginZip', () => {
  it('keeps binary files byte for byte', async () => {
    const bytes = Buffer.from([0, 255, 10, 13, 128]);
    const chunks: Buffer[] = [];
    for await (const chunk of createPluginZip([{ path: 'a.bin', content: bytes }])) {
      chunks.push(chunk as Buffer);
    }
    const zip = await JSZip.loadAsync(Buffer.concat(chunks));
    expect(Buffer.from(await zip.file('a.bin')!.async('uint8array'))).toEqual(bytes);
  });
});

describe('skillExportLimits', () => {
  it('matches the skill import limits when fileConfig says nothing', () => {
    expect(skillExportLimits({} as ServerRequest)).toEqual({
      maxFiles: 500,
      maxBytes: 500 * 1024 * 1024,
    });
  });

  it('reads the limits from fileConfig.skills, with bytes given in MB', () => {
    const req = {
      config: { fileConfig: { skills: { exportMaxFiles: 30, exportMaxBytes: 2 } } },
    } as unknown as ServerRequest;

    expect(skillExportLimits(req)).toEqual({ maxFiles: 30, maxBytes: 2 * 1024 * 1024 });
  });
});
