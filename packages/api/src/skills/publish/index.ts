import { logger } from '@librechat/data-schemas';
import { ResourceType, AccessRoleIds, PrincipalType } from 'librechat-data-provider';
import type { TSkillPublishScope } from 'librechat-data-provider';
import type { NextFunction, Response } from 'express';
import type { Types } from 'mongoose';
import type { SkillDoc, SkillLookupDeps, SkillRequest } from './lookup';
import type { DepartmentGroups } from '~/user/department';
import type { ServerRequest } from '~/types';
import { conflictResponse, loadSkill } from './lookup';
import { serializeSkill } from '../handlers';

export * from './trial';

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

type PublishPrincipal = { type: string; id: string | null; accessRoleId?: string };

export interface SkillPublishDeps extends SkillLookupDeps {
  findEntriesByResource: (
    resourceType: string,
    resourceId: string | Types.ObjectId,
  ) => Promise<Array<{ principalType: string; principalId?: string | Types.ObjectId | null }>>;
  bulkUpdateResourcePermissions: (params: {
    resourceType: string;
    resourceId: string | Types.ObjectId;
    updatedPrincipals: PublishPrincipal[];
    revokedPrincipals: PublishPrincipal[];
    grantedBy: string;
  }) => Promise<{ errors?: Array<{ error: string }> } | undefined>;
  sharePolicy: SkillSharePolicy;
  /** 작성자 id별 부서. 'team' 게시는 작성자 부서 그룹에 부여한다. */
  getSkillAuthorDepartments: (
    authorIds: Array<string | Types.ObjectId>,
  ) => Promise<Record<string, string>>;
  departmentGroups: Pick<DepartmentGroups, 'ensureGroup' | 'findGroupIds'>;
}

const PUBLISH_SCOPES = new Set<string>(['all', 'team', 'me']);
const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

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

type PublishPrincipals = {
  updatedPrincipals: PublishPrincipal[];
  revokedPrincipals: PublishPrincipal[];
};

const PUBLIC_PRINCIPAL = { type: PrincipalType.PUBLIC, id: null };

/**
 * 'all' 은 public viewer 를, 'team' 은 작성자 부서 그룹 viewer 를 주고 서로의 부여와 다른 부서 그룹
 * 부여를 거둔다. 사람이 준 공유는 둘 다 남긴다. 'me' 는 작성자 항목만 남기고 모두 거둔다.
 */
async function publishPrincipals(
  deps: SkillPublishDeps,
  scope: TSkillPublishScope,
  skill: SkillDoc,
  teamGroupId: string | null,
): Promise<PublishPrincipals> {
  const authorId = skill.author.toString();
  const entries = (await deps.findEntriesByResource(ResourceType.SKILL, skill._id))
    .filter((entry) => entry.principalType !== PrincipalType.PUBLIC)
    .map((entry) => ({ type: entry.principalType, id: entry.principalId?.toString() ?? null }));

  if (scope === 'me') {
    const shared = entries.filter(
      (principal) => !(principal.type === PrincipalType.USER && principal.id === authorId),
    );
    return { updatedPrincipals: [], revokedPrincipals: [PUBLIC_PRINCIPAL, ...shared] };
  }

  const departmentGroupIds = await deps.departmentGroups.findGroupIds();
  const staleDepartmentGrants = entries.filter(
    (principal) =>
      principal.type === PrincipalType.GROUP &&
      principal.id !== null &&
      principal.id !== teamGroupId &&
      departmentGroupIds.has(principal.id),
  );
  if (scope === 'all') {
    return {
      updatedPrincipals: [{ ...PUBLIC_PRINCIPAL, accessRoleId: AccessRoleIds.SKILL_VIEWER }],
      revokedPrincipals: staleDepartmentGrants,
    };
  }
  return {
    updatedPrincipals: [
      { type: PrincipalType.GROUP, id: teamGroupId, accessRoleId: AccessRoleIds.SKILL_VIEWER },
    ],
    revokedPrincipals: [PUBLIC_PRINCIPAL, ...staleDepartmentGrants],
  };
}

async function readAuthorDepartment(
  deps: SkillPublishDeps,
  skill: SkillDoc,
): Promise<string | undefined> {
  const authorId = skill.author.toString();
  const departments = await deps.getSkillAuthorDepartments([authorId]);
  return departments[authorId];
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
    if (typeof scope !== 'string' || !PUBLISH_SCOPES.has(scope)) {
      return res.status(400).json({ error: "scope must be 'all', 'team' or 'me'" });
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
      const department =
        publishScope === 'team' ? await readAuthorDepartment(deps, skill) : undefined;
      if (publishScope === 'team' && !department) {
        return res.status(400).json({
          error: "Set the author's department before publishing to the team",
          code: 'DEPARTMENT_REQUIRED',
        });
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

      /**
       * 그룹 문서를 만들 수 있으므로 공유 권한 검사를 통과한 뒤에 한다. 부여는 게시 때 작성자 부서
       * 그룹에 남고, 작성자가 부서를 옮겨도 따라가지 않는다(다시 게시하면 새 부서로 옮긴다).
       */
      const teamGroupId = department ? await deps.departmentGroups.ensureGroup(department) : null;
      const principals = await publishPrincipals(deps, publishScope, skill, teamGroupId);
      const published = await deps.setSkillPublicationState({
        id: skill._id.toString(),
        expectedVersion: skill.version,
        publishedAt: new Date(),
      });
      if (published.status === 'not_found') {
        return res.status(404).json({ error: 'Skill not found' });
      }
      if (published.status === 'conflict') {
        return res.status(409).json(conflictResponse(published.current, isPublic));
      }

      try {
        const aclResult = await deps.bulkUpdateResourcePermissions({
          resourceType: ResourceType.SKILL,
          resourceId: skill._id,
          ...principals,
          grantedBy: userId,
        });
        if (aclResult?.errors?.length) {
          throw new Error(aclResult.errors.map((entry) => entry.error).join('; '));
        }
      } catch (aclError) {
        logger.error(
          `[skillPublish] ACL update failed for ${skill._id}, restoring publish state`,
          aclError,
        );
        const restored = await deps.setSkillPublicationState({
          id: skill._id.toString(),
          expectedVersion: published.skill.version,
          publishedAt: skill.publishedAt ?? null,
        });
        if (restored.status !== 'updated') {
          logger.error(`[skillPublish] Could not restore publish state for ${skill._id}`);
        }
        return res
          .status(500)
          .json({ error: 'Failed to update sharing for the skill', code: 'PUBLISH_ACL_FAILED' });
      }
      return res
        .status(200)
        .json(
          serializeSkill(
            published.skill,
            isPublic,
            new Map(department ? [[skill._id.toString(), department]] : []),
          ),
        );
    } catch (error) {
      logger.error('[skillPublish] Failed to publish skill', error);
      return res.status(500).json({ error: 'Failed to publish skill' });
    }
  };
}
