import { logger } from '@librechat/data-schemas';
import {
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  SKILL_NAME_MAX_LENGTH,
} from 'librechat-data-provider';
import type { TForkSkillRequest, TForkSkillResponse } from 'librechat-data-provider';
import type { ISkill, ISkillFile, CreateSkillResult } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import type { ServerRequest, StrategyFunctions } from '~/types';
import type { ImportSkillDeps } from './import';
import { resolveRequestTenantId } from '~/middleware/tenant';
import { resolveDownloadPath } from '~/storage/path';
import { isDeploymentSkillId } from './deployment';
import { persistSkillFile } from './import';
import { serializeSkill } from './handlers';

type SkillDoc = ISkill & { _id: Types.ObjectId };

export interface ForkSkillDeps
  extends Pick<
    ImportSkillDeps,
    | 'createSkill'
    | 'deleteSkill'
    | 'upsertSkillFile'
    | 'saveBuffer'
    | 'deleteFile'
    | 'grantPermission'
  > {
  getSkillById: (id: string | Types.ObjectId) => Promise<SkillDoc | null>;
  listSkillFiles: (
    skillId: string | Types.ObjectId,
  ) => Promise<Array<ISkillFile & { _id: Types.ObjectId }>>;
  getStrategyFunctions: (source: string) => Partial<StrategyFunctions>;
}

type ForkFileResult = { path: string; status: 'ok' | 'error'; error?: string };

/** 응용한 스킬 이름: 원본 이름을 먼저 쓰고, 호출자가 같은 이름을 이미 가졌으면 `-fork`, `-fork-2` … 순으로 붙인다. */
export function forkNameCandidates(originalName: string): string[] {
  const suffixes = ['', '-fork', '-fork-2', '-fork-3', '-fork-4', '-fork-5'];
  return suffixes.map((suffix) => {
    const base = originalName.slice(0, SKILL_NAME_MAX_LENGTH - suffix.length).replace(/-+$/, '');
    return `${base}${suffix}`;
  });
}

function isDuplicateKeyError(error: unknown): boolean {
  const code = (error as { code?: number | string } | null)?.code;
  return code === 11000 || code === '11000';
}

function isValidationError(error: unknown): error is Error & { issues: unknown[] } {
  return (error as { code?: string } | null)?.code === 'SKILL_VALIDATION_FAILED';
}

export async function readStoredFile(
  req: ServerRequest,
  deps: Pick<ForkSkillDeps, 'getStrategyFunctions'>,
  file: ISkillFile,
): Promise<Buffer> {
  const strategy = deps.getStrategyFunctions(file.source);
  if (!strategy.getDownloadStream) {
    throw new Error(`Storage backend "${file.source}" does not support reads`);
  }
  const stream = await strategy.getDownloadStream(req, resolveDownloadPath(file));
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

type ForkAuthor = { id: string; objectId: Types.ObjectId; name: string; tenantId?: string };

type CreateForkOutcome =
  | { status: 'created'; skill: SkillDoc }
  | { status: 'invalid'; issues: unknown[] }
  | { status: 'taken' };

/** 후보 이름을 차례로 써 보고, 이름이 겹치면 다음 후보로 넘어간다. */
async function createForkedSkill(
  deps: ForkSkillDeps,
  original: SkillDoc,
  names: string[],
  author: ForkAuthor,
): Promise<CreateForkOutcome> {
  let created: CreateSkillResult | null = null;
  for (const name of names) {
    try {
      created = await deps.createSkill({
        name,
        displayTitle: original.displayTitle,
        description: original.description,
        body: original.body,
        frontmatter: original.frontmatter,
        category: original.category,
        alwaysApply: original.alwaysApply,
        manualMinutes: original.manualMinutes,
        forkOf: original._id,
        icon: original.icon,
        author: author.objectId,
        authorName: author.name,
        tenantId: author.tenantId,
      });
      break;
    } catch (error) {
      if (isValidationError(error)) {
        return { status: 'invalid', issues: error.issues };
      }
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }
  if (!created) {
    return { status: 'taken' };
  }
  return { status: 'created', skill: created.skill as SkillDoc };
}

/** 소유 권한을 주지 못하면 만든 사본을 지우고 false 를 돌려준다. */
async function grantForkOwner(
  deps: ForkSkillDeps,
  forked: SkillDoc,
  userId: string,
): Promise<boolean> {
  try {
    await deps.grantPermission({
      principalType: PrincipalType.USER,
      principalId: userId,
      resourceType: ResourceType.SKILL,
      resourceId: forked._id,
      accessRoleId: AccessRoleIds.SKILL_OWNER,
      grantedBy: userId,
    });
    return true;
  } catch (permissionError) {
    logger.error(
      `[forkSkill] Failed to grant SKILL_OWNER for ${forked._id}, rolling back:`,
      permissionError,
    );
    await deps
      .deleteSkill(forked._id.toString())
      .catch((rollbackError) =>
        logger.error(`[forkSkill] Compensating delete failed for ${forked._id}:`, rollbackError),
      );
    return false;
  }
}

/** 파일마다 따로 복사해, 하나가 실패해도 나머지는 계속 옮긴다. */
async function copySkillFiles(
  req: ServerRequest,
  deps: ForkSkillDeps,
  original: SkillDoc,
  forked: SkillDoc,
  author: ForkAuthor,
): Promise<ForkFileResult[]> {
  const context = {
    userId: author.id,
    skillId: forked._id,
    authorId: author.objectId,
    tenantId: author.tenantId,
  };
  const fileResults: ForkFileResult[] = [];
  for (const file of await deps.listSkillFiles(original._id)) {
    try {
      const buffer = await readStoredFile(req, deps, file);
      await persistSkillFile(req as unknown as Request, deps, file, buffer, context);
      fileResults.push({ path: file.relativePath, status: 'ok' });
    } catch (error) {
      logger.error(`[forkSkill] Failed to copy file ${file.relativePath}:`, error);
      fileResults.push({
        path: file.relativePath,
        status: 'error',
        error: (error as Error).message,
      });
    }
  }
  return fileResults;
}

function summarizeFileCopies(fileResults: ForkFileResult[]): TForkSkillResponse['_forkSummary'] {
  const errors = fileResults.filter((result) => result.status === 'error');
  return {
    filesProcessed: fileResults.length,
    filesSucceeded: fileResults.length - errors.length,
    filesFailed: errors.length,
    errors,
  };
}

/** `POST /api/skills/:id/fork`: 원본 본문과 파일을 복사한 비공개 새 스킬을 만든다. 원본 응용 수는 사본을 게시해야 오른다. */
export function createForkSkillHandler(deps: ForkSkillDeps) {
  return async function forkSkillHandler(req: ServerRequest, res: Response): Promise<Response> {
    try {
      const user = req.user;
      if (!user || !user.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const { name: requestedName } = (req.body ?? {}) as TForkSkillRequest;
      if (requestedName !== undefined && typeof requestedName !== 'string') {
        return res.status(400).json({ error: 'name must be a string' });
      }

      const { id } = req.params as { id: string };
      const resolved = (req as ServerRequest & { resourceAccess?: { resourceInfo?: SkillDoc } })
        .resourceAccess?.resourceInfo;
      const original = resolved ?? (await deps.getSkillById(id));
      if (!original) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      const author: ForkAuthor = {
        id: user.id,
        objectId: (user._id ?? user.id) as unknown as Types.ObjectId,
        name: user.name ?? user.username ?? 'Unknown',
        tenantId: resolveRequestTenantId(req),
      };
      // 배포 스킬과 이름이 같은 사용자 스킬은 목록에서 배포 스킬에 가려지므로 원본 이름을 건너뛴다.
      const fromDeployment = isDeploymentSkillId(original._id);
      const names = requestedName
        ? [requestedName]
        : forkNameCandidates(original.name).filter(
            (name) => !fromDeployment || name !== original.name,
          );
      const outcome = await createForkedSkill(deps, original, names, author);
      if (outcome.status === 'invalid') {
        return res.status(400).json({ error: 'Validation failed', issues: outcome.issues });
      }
      if (outcome.status === 'taken') {
        return res.status(409).json({ error: 'A skill with this name already exists' });
      }
      const forked = outcome.skill;
      if (!(await grantForkOwner(deps, forked, user.id))) {
        return res.status(500).json({ error: 'Failed to initialize skill permissions' });
      }

      const fileResults = await copySkillFiles(req, deps, original, forked, author);
      const refreshed = (await deps.getSkillById(forked._id)) ?? forked;
      const response: TForkSkillResponse = {
        ...serializeSkill(refreshed, false),
        forkCount: 0,
        _forkSummary: summarizeFileCopies(fileResults),
      };
      return res.status(201).json(response);
    } catch (error) {
      logger.error('[POST /skills/:id/fork] Error forking skill', error);
      return res.status(500).json({ error: 'Error forking skill' });
    }
  };
}
