import { logger } from '@librechat/data-schemas';
import {
  ResourceType,
  AccessRoleIds,
  PrincipalType,
  PermissionBits,
} from 'librechat-data-provider';
import type { ISkill, UpdateSkillInput, UpdateSkillResult } from '@librechat/data-schemas';
import type { TSkillConflictResponse, TSkillPublishScope } from 'librechat-data-provider';
import type { NextFunction, Response } from 'express';
import type { Types } from 'mongoose';
import type { ServerRequest } from '~/types';
import { serializeSkill } from './handlers';

type SkillDoc = ISkill & { _id: Types.ObjectId };

type UpdateSkill = (params: {
  id: string;
  expectedVersion: number;
  update: UpdateSkillInput;
}) => Promise<UpdateSkillResult>;

/** 시험 대화에서 읽는 메시지 칸. 응답 행은 턴이 끝날 때 다시 저장되므로 `updatedAt` 이 끝난 시각이다. */
export interface SkillTestMessage {
  messageId: string;
  parentMessageId?: string | null;
  isCreatedByUser?: boolean;
  manualSkills?: string[] | null;
  error?: boolean | null;
  unfinished?: boolean | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

interface SkillLookupDeps {
  getSkillById: (id: string | Types.ObjectId) => Promise<SkillDoc | null>;
  updateSkill: UpdateSkill;
}

export interface SkillTestResultDeps extends SkillLookupDeps {
  getConvo: (user: string, conversationId: string) => Promise<object | null>;
  getMessages: (
    filter: { conversationId: string; user: string },
    select?: string,
  ) => Promise<SkillTestMessage[]>;
  hasPublicPermission: (params: {
    resourceType: string;
    resourceId: string | Types.ObjectId;
    requiredPermissions: number;
  }) => Promise<boolean>;
}

type SharePolicyMiddleware = (
  req: ServerRequest,
  res: Response,
  next: NextFunction,
) => Promise<Response | void>;

/** 공유 대화상자(`PUT /api/permissions`)가 쓰는 역할 권한 검사. `createSharePolicyMiddleware` 결과를 그대로 받는다. */
export interface SkillSharePolicy {
  checkShareAccess: SharePolicyMiddleware;
  checkSharePublicAccess: SharePolicyMiddleware;
}

type PublishPrincipal = { type: string; id: null; accessRoleId?: string };

export interface SkillPublishDeps extends SkillLookupDeps {
  bulkUpdateResourcePermissions: (params: {
    resourceType: string;
    resourceId: string | Types.ObjectId;
    updatedPrincipals: PublishPrincipal[];
    revokedPrincipals: PublishPrincipal[];
    grantedBy: string;
  }) => Promise<unknown>;
  sharePolicy: SkillSharePolicy;
}

type SkillRequest = ServerRequest & { resourceAccess?: { resourceInfo?: SkillDoc } };

const PUBLISH_SCOPES = new Set<string>(['all', 'me']);
const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

async function loadSkill(req: SkillRequest, deps: SkillLookupDeps): Promise<SkillDoc | null> {
  return (
    req.resourceAccess?.resourceInfo ?? (await deps.getSkillById((req.params as { id: string }).id))
  );
}

function conflictResponse(current: SkillDoc, isPublic: boolean): TSkillConflictResponse {
  return { error: 'skill_version_conflict', current: serializeSkill(current, isPublic) };
}

function toTime(value: Date | string | null | undefined): number {
  return value == null ? Number.NaN : new Date(value).getTime();
}

/** 이 스킬을 고른 마지막 사용자 턴과 그 턴의 마지막 응답. */
function findTestTurn(
  messages: SkillTestMessage[],
  skillName: string,
): { userMessage: SkillTestMessage | null; response: SkillTestMessage | null } {
  let userMessage: SkillTestMessage | null = null;
  for (const message of messages) {
    const picked = message.isCreatedByUser === true && message.manualSkills?.includes(skillName);
    if (picked && (!userMessage || toTime(message.createdAt) >= toTime(userMessage.createdAt))) {
      userMessage = message;
    }
  }
  if (!userMessage) {
    return { userMessage: null, response: null };
  }
  let response: SkillTestMessage | null = null;
  for (const message of messages) {
    const answers =
      message.isCreatedByUser !== true && message.parentMessageId === userMessage.messageId;
    if (answers && (!response || toTime(message.updatedAt) >= toTime(response.updatedAt))) {
      response = message;
    }
  }
  return { userMessage, response };
}

/** `POST /api/skills/:id/test-result`: 시험 대화 한 턴이 오류 없이 끝났음을 확인하고 걸린 초를 `lastTest` 에 적는다. */
export function createSkillTestResultHandler(deps: SkillTestResultDeps) {
  return async function skillTestResultHandler(
    req: SkillRequest,
    res: Response,
  ): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { conversationId, version } = (req.body ?? {}) as {
      conversationId?: unknown;
      version?: unknown;
    };
    if (typeof conversationId !== 'string' || !conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }
    if (typeof version !== 'number' || !Number.isInteger(version)) {
      return res.status(400).json({ error: 'version must be an integer' });
    }
    try {
      const skill = await loadSkill(req, deps);
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }
      const isPublic = () =>
        deps.hasPublicPermission({
          resourceType: ResourceType.SKILL,
          resourceId: skill._id,
          requiredPermissions: PermissionBits.VIEW,
        });
      if (skill.version !== version) {
        return res.status(409).json(conflictResponse(skill, await isPublic()));
      }
      const convo = await deps.getConvo(userId, conversationId);
      if (!convo) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const messages = await deps.getMessages(
        { conversationId, user: userId },
        'messageId parentMessageId isCreatedByUser manualSkills error unfinished createdAt updatedAt',
      );
      const { userMessage, response } = findTestTurn(messages, skill.name);
      if (!userMessage) {
        return res
          .status(400)
          .json({ error: 'The conversation did not run this skill', code: 'SKILL_NOT_USED' });
      }
      if (!response) {
        return res
          .status(400)
          .json({ error: 'The test turn has no response yet', code: 'RESPONSE_MISSING' });
      }
      if (response.error || response.unfinished) {
        return res
          .status(400)
          .json({ error: 'The test turn did not finish cleanly', code: 'RESPONSE_FAILED' });
      }
      const elapsedMs = toTime(response.updatedAt) - toTime(userMessage.createdAt);
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
        return res
          .status(400)
          .json({ error: 'The test turn has no usable timestamps', code: 'RESPONSE_MISSING' });
      }

      // updateSkill 은 버전을 올리므로 기록은 올라간 버전으로 적어야 게시 조건과 맞는다.
      const result = await deps.updateSkill({
        id: skill._id.toString(),
        expectedVersion: version,
        update: {
          lastTest: {
            version: version + 1,
            seconds: Math.round(elapsedMs / 100) / 10,
            conversationId,
            at: new Date(),
          },
        },
      });
      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Skill not found' });
      }
      if (result.status === 'conflict') {
        return res.status(409).json(conflictResponse(result.current, await isPublic()));
      }
      return res.status(200).json(serializeSkill(result.skill, await isPublic()));
    } catch (error) {
      logger.error('[skillTestResult] Failed to record test result', error);
      return res.status(500).json({ error: 'Failed to record test result' });
    }
  };
}

function publishBlocker(skill: SkillDoc): { code: string; error: string } | null {
  if (!skill.lastTest || skill.lastTest.version !== skill.version) {
    return { code: 'TEST_REQUIRED', error: 'Run a test on the current version before publishing' };
  }
  if (!skill.manualMinutes || skill.manualMinutes <= 0) {
    return {
      code: 'MANUAL_MINUTES_REQUIRED',
      error: 'Set how many minutes the task takes by hand',
    };
  }
  if (!(skill.displayTitle ?? skill.name)?.trim()) {
    return { code: 'NAME_REQUIRED', error: 'The skill needs a name' };
  }
  if (!(skill.body ?? '').replace(FRONTMATTER_BLOCK, '').trim()) {
    return { code: 'BODY_REQUIRED', error: 'The skill needs instructions' };
  }
  return null;
}

/** 공유 정책 미들웨어를 스킬 공유 요청처럼 돌린다. 거절하면 미들웨어가 이미 응답을 썼으므로 false. */
async function passesSharePolicy(
  middleware: SharePolicyMiddleware,
  req: ServerRequest,
  res: Response,
  isPublic: boolean,
): Promise<boolean> {
  const shareRequest = Object.assign(Object.create(req) as ServerRequest, {
    params: { resourceType: ResourceType.SKILL },
    body: { public: isPublic },
  });
  let passed = false;
  await middleware(shareRequest, res, () => {
    passed = true;
  });
  return passed;
}

function publishPrincipals(scope: TSkillPublishScope): {
  updatedPrincipals: PublishPrincipal[];
  revokedPrincipals: PublishPrincipal[];
} {
  const publicPrincipal = { type: PrincipalType.PUBLIC, id: null };
  return scope === 'all'
    ? {
        updatedPrincipals: [{ ...publicPrincipal, accessRoleId: AccessRoleIds.SKILL_VIEWER }],
        revokedPrincipals: [],
      }
    : { updatedPrincipals: [], revokedPrincipals: [publicPrincipal] };
}

/** `POST /api/skills/:id/publish`: 게시 조건을 확인하고 공개 범위를 ACL 에 적은 뒤 `publishedAt` 을 남긴다. */
export function createSkillPublishHandler(deps: SkillPublishDeps) {
  return async function skillPublishHandler(
    req: SkillRequest,
    res: Response,
  ): Promise<Response | void> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const scope = (req.body as { scope?: unknown } | undefined)?.scope;
    if (scope === 'team') {
      return res
        .status(400)
        .json({ error: 'Team scope is not available yet', code: 'SCOPE_UNAVAILABLE' });
    }
    if (typeof scope !== 'string' || !PUBLISH_SCOPES.has(scope)) {
      return res.status(400).json({ error: "scope must be 'all' or 'me'" });
    }
    const publishScope = scope as TSkillPublishScope;
    try {
      const skill = await loadSkill(req, deps);
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }
      const blocker = publishBlocker(skill);
      if (blocker) {
        return res.status(400).json(blocker);
      }
      const isPublic = publishScope === 'all';
      if (!(await passesSharePolicy(deps.sharePolicy.checkShareAccess, req, res, isPublic))) {
        return;
      }
      if (
        isPublic &&
        !(await passesSharePolicy(deps.sharePolicy.checkSharePublicAccess, req, res, isPublic))
      ) {
        return;
      }

      const lastTest = skill.lastTest as NonNullable<ISkill['lastTest']>;
      const published = await deps.updateSkill({
        id: skill._id.toString(),
        expectedVersion: skill.version,
        update: { publishedAt: new Date(), lastTest: { ...lastTest, version: skill.version + 1 } },
      });
      if (published.status === 'not_found') {
        return res.status(404).json({ error: 'Skill not found' });
      }
      if (published.status === 'conflict') {
        return res.status(409).json(conflictResponse(published.current, isPublic));
      }

      try {
        await deps.bulkUpdateResourcePermissions({
          resourceType: ResourceType.SKILL,
          resourceId: skill._id,
          ...publishPrincipals(publishScope),
          grantedBy: userId,
        });
      } catch (aclError) {
        logger.error(
          `[skillPublish] ACL update failed for ${skill._id}, restoring publish state`,
          aclError,
        );
        const restored = await deps.updateSkill({
          id: skill._id.toString(),
          expectedVersion: published.skill.version,
          update: {
            publishedAt: skill.publishedAt ?? null,
            lastTest: { ...lastTest, version: published.skill.version + 1 },
          },
        });
        if (restored.status !== 'updated') {
          logger.error(`[skillPublish] Could not restore publish state for ${skill._id}`);
        }
        return res.status(500).json({ error: 'Failed to update sharing for the skill' });
      }
      return res.status(200).json(serializeSkill(published.skill, isPublic));
    } catch (error) {
      logger.error('[skillPublish] Failed to publish skill', error);
      return res.status(500).json({ error: 'Failed to publish skill' });
    }
  };
}
