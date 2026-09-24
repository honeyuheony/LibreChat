import { logger } from '@librechat/data-schemas';
import { ResourceType, PermissionBits } from 'librechat-data-provider';
import type { ListSkillsByAccessParams, ListSkillsByAccessResult } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { Types } from 'mongoose';
import type { ServerRequest } from '~/types';
import { getDeploymentSkillRegistry } from './deployment';

/** `GET /api/skills` 이 접근 가능한 스킬 id를 구할 때 쓰는 것과 같은 두 building block. */
export interface SkillCategoriesDeps {
  findAccessibleResources: (params: {
    userId: string;
    role?: string | null;
    resourceType: string;
    requiredPermissions: number;
  }) => Promise<Types.ObjectId[]>;
  findPubliclyAccessibleResources: (params: {
    resourceType: string;
    requiredPermissions: number;
  }) => Promise<Types.ObjectId[]>;
  /** DB 스킬만 대상으로 하는 원본 목록 함수(배포 스킬과 병합하지 않은 것). */
  listSkillsByAccess: (params: ListSkillsByAccessParams) => Promise<ListSkillsByAccessResult>;
}

const CATEGORY_COUNT_PAGE_SIZE = 100;

/** 빈 카테고리는 ''로 그대로 센다. */
function bumpCategoryCount(counts: Map<string, number>, category: string | undefined): void {
  const value = category ?? '';
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

async function countDbSkillCategories(
  listSkillsByAccess: SkillCategoriesDeps['listSkillsByAccess'],
  accessibleIds: Types.ObjectId[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let cursor: string | null = null;
  for (;;) {
    const page: ListSkillsByAccessResult = await listSkillsByAccess({
      accessibleIds,
      limit: CATEGORY_COUNT_PAGE_SIZE,
      cursor,
    });
    for (const skill of page.skills) {
      bumpCategoryCount(counts, skill.category);
    }
    if (!page.has_more || !page.after) {
      break;
    }
    cursor = page.after;
  }
  return counts;
}

/** 배포 스킬은 권한 자원이 아니라 항상 접근 가능하므로(`mergeDeploymentSkillIds`가 무조건
 *  합치는 것과 같은 규칙) accessibleIds로 거르지 않고 전부 센다. */
function countDeploymentSkillCategories(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const skill of getDeploymentSkillRegistry().list()) {
    bumpCategoryCount(counts, skill.category);
  }
  return counts;
}

export function createSkillCategoriesHandler(
  deps: SkillCategoriesDeps,
): (req: ServerRequest, res: Response) => Promise<void> {
  return async function skillCategoriesHandler(req: ServerRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user || !user.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const [accessibleIds, publicIds] = await Promise.all([
        deps.findAccessibleResources({
          userId: user.id,
          role: user.role,
          resourceType: ResourceType.SKILL,
          requiredPermissions: PermissionBits.VIEW,
        }),
        deps.findPubliclyAccessibleResources({
          resourceType: ResourceType.SKILL,
          requiredPermissions: PermissionBits.VIEW,
        }),
      ]);
      const mergedIds = Array.from(
        new Map([...accessibleIds, ...publicIds].map((id) => [id.toString(), id])).values(),
      );

      const [dbCounts, deploymentCounts] = await Promise.all([
        countDbSkillCategories(deps.listSkillsByAccess, mergedIds),
        Promise.resolve(countDeploymentSkillCategories()),
      ]);

      const combined = new Map(dbCounts);
      for (const [category, count] of deploymentCounts) {
        combined.set(category, (combined.get(category) ?? 0) + count);
      }

      const categories = Array.from(combined.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value));
      const total = categories.reduce((sum, entry) => sum + entry.count, 0);

      return res.status(200).json({ categories, total });
    } catch (error) {
      logger.error('[GET /skills/categories] Error counting skill categories', error);
      return res.status(500).json({ error: 'Error counting skill categories' });
    }
  };
}
