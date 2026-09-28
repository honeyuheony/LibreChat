import JSZip from 'jszip';
import yaml from 'js-yaml';
import { Readable } from 'stream';
import { logger } from '@librechat/data-schemas';
import { SKILL_NAME_PATTERN, mergeFileConfig } from 'librechat-data-provider';
import type { ISkill, ISkillFile, ISkillPack } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { Types } from 'mongoose';
import type { ServerRequest } from '~/types';
import type { ForkSkillDeps } from './fork';
import { DEFAULT_SKILL_IMPORT_LIMITS } from './limits';
import { isSafeSkillFilePath } from './path';
import { openStoredFile } from './fork';

export type ExportSkill = Pick<
  ISkill,
  'name' | 'displayTitle' | 'description' | 'body' | 'frontmatter' | 'authorName' | 'version'
> & { _id: Types.ObjectId };

export type BundledFile = { relativePath: string; content: Buffer | Readable };

export type PluginFile = { path: string; content: string | Buffer | Readable };

/** zip 하나에 담을 파일 수(스킬마다 SKILL.md 포함)와 원본 bytes 합계의 상한. */
export type ExportLimits = { maxFiles: number; maxBytes: number };

export type ExportManifest = {
  slug: string;
  name: string;
  description: string;
  author: string;
  version: string;
};

export interface SkillExportDeps
  extends Pick<ForkSkillDeps, 'listSkillFiles' | 'getStrategyFunctions'> {
  getSkillById: (id: string | Types.ObjectId) => Promise<ExportSkill | null>;
  getLimits: (req: ServerRequest) => ExportLimits;
}

export interface SkillPackExportDeps extends SkillExportDeps {
  getSkillPackById: (
    id: string,
  ) => Promise<Pick<
    ISkillPack,
    'name' | 'slug' | 'description' | 'authorName' | 'skillIds'
  > | null>;
  /** 요청한 사용자가 볼 수 있는 스킬 id. 「우리 팀」 배포 스킬의 부서 판정까지 끝난 값이어야 한다. */
  findViewableSkillIds: (user: ServerRequest['user']) => Promise<Set<string>>;
}

type BundledSkill = { skill: ExportSkill; files: BundledFile[] };

type PlannedSkill = { skill: ExportSkill; stored: ISkillFile[] };

type ExportHandler = (req: ServerRequest, res: Response) => Promise<Response | void>;

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

const folderName = (candidate: string | undefined, fallback: string) =>
  candidate && SKILL_NAME_PATTERN.test(candidate) ? candidate : fallback;

/** 대소문자만 다른 skill.md 도 본문 SKILL.md 를 덮어쓰므로 뺀다. */
const isBundledPath = (relativePath: string) =>
  isSafeSkillFilePath(relativePath) && relativePath.toLowerCase() !== 'skill.md';

const tableCell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

function connectorsOf(skill: ExportSkill): string[] {
  const metadata = skill.frontmatter?.metadata as { connectors?: unknown } | undefined;
  const connectors = metadata?.connectors;
  return Array.isArray(connectors)
    ? connectors.filter((name): name is string => typeof name === 'string')
    : [];
}

/** 저장한 본문에는 머리말이 없으므로 name·description 을 앞세워 다시 붙인다. */
function skillMarkdown(skill: ExportSkill): string {
  const rest = Object.fromEntries(
    Object.entries(skill.frontmatter ?? {}).filter(
      ([key]) => key !== 'name' && key !== 'description',
    ),
  );
  const header = yaml.dump(
    { name: skill.name, description: skill.description, ...rest },
    { lineWidth: -1 },
  );
  return `---\n${header}---\n\n${skill.body}`;
}

function readme(manifest: ExportManifest, skills: ExportSkill[], connectors: string[]): string {
  return [
    `# ${manifest.name}`,
    '',
    manifest.description,
    '',
    `- 만든 사람: ${manifest.author}`,
    '',
    '## 들어 있는 것',
    '',
    '| 폴더 | 이름 | 하는 일 |',
    '|---|---|---|',
    ...skills.map(
      (skill) =>
        `| skills/${skill.name} | ${tableCell(skill.displayTitle || skill.name)} | ${tableCell(skill.description)} |`,
    ),
    '',
    '## MCP 서버',
    '',
    connectors.length > 0
      ? connectors.map((name) => `- ${name}`).join('\n')
      : '- 없음. 올린 문서만 사용한다.',
    '',
  ].join('\n');
}

/** Claude 플러그인 배치. 폴더 이름이 될 수 없는 스킬과 스킬 폴더를 벗어나는 파일은 담지 않는다. */
export function pluginFiles(manifest: ExportManifest, bundles: BundledSkill[]): PluginFile[] {
  const included = bundles.filter(({ skill }) => SKILL_NAME_PATTERN.test(skill.name));
  const connectors = [...new Set(included.flatMap(({ skill }) => connectorsOf(skill)))];
  const files: PluginFile[] = [
    {
      path: '.claude-plugin/plugin.json',
      content: `${JSON.stringify(
        {
          name: manifest.slug,
          version: manifest.version,
          description: manifest.description,
          author: { name: manifest.author },
        },
        null,
        2,
      )}\n`,
    },
  ];
  for (const { skill, files: bundled } of included) {
    const folder = `skills/${skill.name}`;
    files.push({ path: `${folder}/SKILL.md`, content: skillMarkdown(skill) });
    for (const file of bundled) {
      if (isBundledPath(file.relativePath)) {
        files.push({ path: `${folder}/${file.relativePath}`, content: file.content });
      }
    }
  }
  if (connectors.length > 0) {
    files.push({
      path: '.mcp.json',
      content: `${JSON.stringify(
        { mcpServers: Object.fromEntries(connectors.map((name) => [name, {}])) },
        null,
        2,
      )}\n`,
    });
  }
  files.push({
    path: 'README.md',
    content: readme(
      manifest,
      included.map(({ skill }) => skill),
      connectors,
    ),
  });
  return files;
}

export function createPluginZip(files: PluginFile[]): Readable {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  return new Readable().wrap(
    zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE' }),
  );
}

async function planSkill(deps: SkillExportDeps, skill: ExportSkill): Promise<PlannedSkill> {
  const stored = await deps.listSkillFiles(skill._id);
  return { skill, stored: stored.filter((file) => isBundledPath(file.relativePath)) };
}

function exceedsLimits(plans: PlannedSkill[], limits: ExportLimits): boolean {
  let files = 0;
  let bytes = 0;
  for (const { skill, stored } of plans) {
    files += stored.length + 1;
    bytes += Buffer.byteLength(skill.body);
    for (const file of stored) {
      bytes += file.bytes ?? 0;
    }
  }
  return files > limits.maxFiles || bytes > limits.maxBytes;
}

/** zip 이 이 항목을 쓸 차례가 되어서야 저장소 스트림을 연다. 파일을 한꺼번에 열거나 메모리에 모으지 않는다. */
function lazyStoredFile(req: ServerRequest, deps: SkillExportDeps, file: ISkillFile): Readable {
  let source: Readable | undefined;
  let opening = false;
  const lazy: Readable = new Readable({
    read() {
      if (source) {
        source.resume();
        return;
      }
      if (opening) {
        return;
      }
      opening = true;
      openStoredFile(req, deps, file).then(
        (stored) => {
          // 저장소마다 스트림 구현이 달라 readStoredFile 처럼 비동기 순회로만 읽는다.
          const stream = Readable.from(stored);
          source = stream;
          stream.on('data', (chunk: Buffer) => {
            if (!lazy.push(chunk)) {
              stream.pause();
            }
          });
          stream.on('end', () => lazy.push(null));
          stream.on('error', (error) => lazy.destroy(error));
        },
        (error: Error) => lazy.destroy(error),
      );
    },
    destroy(error, callback) {
      source?.destroy();
      callback(error);
    },
  });
  return lazy;
}

function streamPluginZip(
  req: ServerRequest,
  res: Response,
  deps: SkillExportDeps,
  manifest: ExportManifest,
  plans: PlannedSkill[],
  logLabel: string,
): void {
  const lazyFiles: Readable[] = [];
  const bundles = plans.map(({ skill, stored }) => ({
    skill,
    files: stored.map((file) => {
      const content = lazyStoredFile(req, deps, file);
      lazyFiles.push(content);
      return { relativePath: file.relativePath, content };
    }),
  }));
  const zip = createPluginZip(pluginFiles(manifest, bundles));
  const filename = `${manifest.slug}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  // 받는 쪽이 중간에 끊으면 열어 둔 저장소 스트림을 닫는다.
  res.on('close', () => {
    if (!res.writableFinished) {
      lazyFiles.forEach((file) => file.destroy());
    }
  });
  // 헤더를 보낸 뒤라 오류 응답을 쓸 수 없으므로 연결을 끊어 받는 쪽이 깨진 zip 을 쓰지 않게 한다.
  zip.on('error', (error: Error) => {
    logger.error(`${logLabel} Error while streaming the export`, error);
    res.destroy(error);
  });
  zip.pipe(res);
}

/** `fileConfig.skills` 의 내보내기 상한. 적지 않았으면 스킬 가져오기 상한과 같은 기본값을 쓴다. */
export function skillExportLimits(req: ServerRequest): ExportLimits {
  const { skills } = mergeFileConfig(req.config?.fileConfig);
  return {
    maxFiles: skills?.exportMaxFiles ?? DEFAULT_SKILL_IMPORT_LIMITS.maxEntries,
    maxBytes: skills?.exportMaxBytes ?? DEFAULT_SKILL_IMPORT_LIMITS.maxDecompressedBytes,
  };
}

function tooLarge(res: Response, limits: ExportLimits): Response {
  return res.status(413).json({ error: 'Export is too large', ...limits });
}

/** `GET /api/skills/:id/export`: 볼 수 있는 스킬 하나를 플러그인 zip 으로 내려준다. 권한은 라우트가 본다. */
export function createSkillExportHandler(deps: SkillExportDeps): ExportHandler {
  return async function exportSkillHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const resolved = (req as ServerRequest & { resourceAccess?: { resourceInfo?: ExportSkill } })
        .resourceAccess?.resourceInfo;
      const skill = resolved ?? (await deps.getSkillById(id));
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }
      const manifest: ExportManifest = {
        slug: folderName(skill.name, `skill-${skill._id.toString()}`),
        name: skill.displayTitle || skill.name,
        description: skill.description,
        author: skill.authorName,
        version: `0.${skill.version || 1}.0`,
      };
      const plans = [await planSkill(deps, skill)];
      const limits = deps.getLimits(req);
      if (exceedsLimits(plans, limits)) {
        return tooLarge(res, limits);
      }
      streamPluginZip(req, res, deps, manifest, plans, '[GET /skills/:id/export]');
    } catch (error) {
      logger.error('[GET /skills/:id/export] Error exporting skill', error);
      return res.status(500).json({ error: 'Error exporting skill' });
    }
  };
}

/** `GET /api/skill-packs/:id/export`: 팩에서 요청한 사용자가 볼 수 있는 스킬만 담아 내려준다. */
export function createSkillPackExportHandler(deps: SkillPackExportDeps): ExportHandler {
  return async function exportSkillPackHandler(req: ServerRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      if (!OBJECT_ID_PATTERN.test(id)) {
        return res.status(404).json({ error: 'Pack not found' });
      }
      const [pack, viewable] = await Promise.all([
        deps.getSkillPackById(id),
        deps.findViewableSkillIds(req.user),
      ]);
      if (!pack) {
        return res.status(404).json({ error: 'Pack not found' });
      }
      const skills = await Promise.all(
        pack.skillIds
          .filter((skillId) => viewable.has(skillId.toString()))
          .map((skillId) => deps.getSkillById(skillId)),
      );
      const plans = await Promise.all(
        skills
          .filter((skill): skill is NonNullable<typeof skill> => skill != null)
          .map((skill) => planSkill(deps, skill)),
      );
      const limits = deps.getLimits(req);
      if (exceedsLimits(plans, limits)) {
        return tooLarge(res, limits);
      }
      const manifest: ExportManifest = {
        slug: folderName(pack.slug, `pack-${id.toLowerCase()}`),
        name: pack.name,
        description: pack.description,
        author: pack.authorName,
        version: '0.1.0',
      };
      streamPluginZip(req, res, deps, manifest, plans, '[GET /skill-packs/:id/export]');
    } catch (error) {
      logger.error('[GET /skill-packs/:id/export] Error exporting pack', error);
      return res.status(500).json({ error: 'Error exporting pack' });
    }
  };
}
