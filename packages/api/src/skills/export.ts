import JSZip from 'jszip';
import yaml from 'js-yaml';
import { logger } from '@librechat/data-schemas';
import { SKILL_NAME_PATTERN } from 'librechat-data-provider';
import type { ISkill, ISkillPack } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { Types } from 'mongoose';
import type { ServerRequest } from '~/types';
import type { ForkSkillDeps } from './fork';
import { isSafeSkillFilePath } from './path';
import { readStoredFile } from './fork';

export type ExportSkill = Pick<
  ISkill,
  'name' | 'displayTitle' | 'description' | 'body' | 'frontmatter' | 'authorName' | 'version'
> & { _id: Types.ObjectId };

export type BundledFile = { relativePath: string; content: Buffer };

export type PluginFile = { path: string; content: string | Buffer };

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

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

const folderName = (candidate: string | undefined, fallback: string) =>
  candidate && SKILL_NAME_PATTERN.test(candidate) ? candidate : fallback;

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
      if (isSafeSkillFilePath(file.relativePath) && file.relativePath !== 'SKILL.md') {
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

export function createPluginZip(files: PluginFile[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function bundleSkill(
  req: ServerRequest,
  deps: SkillExportDeps,
  skill: ExportSkill,
): Promise<BundledSkill> {
  const stored = await deps.listSkillFiles(skill._id);
  const files = await Promise.all(
    stored
      .filter((file) => isSafeSkillFilePath(file.relativePath))
      .map(async (file) => ({
        relativePath: file.relativePath,
        content: await readStoredFile(req, deps, file),
      })),
  );
  return { skill, files };
}

async function sendPluginZip(
  res: Response,
  manifest: ExportManifest,
  bundles: BundledSkill[],
): Promise<Response> {
  const zip = await createPluginZip(pluginFiles(manifest, bundles));
  const filename = `${manifest.slug}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  return res.send(zip);
}

/** `GET /api/skills/:id/export`: 볼 수 있는 스킬 하나를 플러그인 zip 으로 내려준다. 권한은 라우트가 본다. */
export function createSkillExportHandler(
  deps: SkillExportDeps,
): (req: ServerRequest, res: Response) => Promise<Response> {
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
      return await sendPluginZip(res, manifest, [await bundleSkill(req, deps, skill)]);
    } catch (error) {
      logger.error('[GET /skills/:id/export] Error exporting skill', error);
      return res.status(500).json({ error: 'Error exporting skill' });
    }
  };
}

/** `GET /api/skill-packs/:id/export`: 팩에서 요청한 사용자가 볼 수 있는 스킬만 담아 내려준다. */
export function createSkillPackExportHandler(
  deps: SkillPackExportDeps,
): (req: ServerRequest, res: Response) => Promise<Response> {
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
      const bundles = await Promise.all(
        skills
          .filter((skill): skill is NonNullable<typeof skill> => skill != null)
          .map((skill) => bundleSkill(req, deps, skill)),
      );
      const manifest: ExportManifest = {
        slug: folderName(pack.slug, `pack-${id.toLowerCase()}`),
        name: pack.name,
        description: pack.description,
        author: pack.authorName,
        version: '0.1.0',
      };
      return await sendPluginZip(res, manifest, bundles);
    } catch (error) {
      logger.error('[GET /skill-packs/:id/export] Error exporting pack', error);
      return res.status(500).json({ error: 'Error exporting pack' });
    }
  };
}
