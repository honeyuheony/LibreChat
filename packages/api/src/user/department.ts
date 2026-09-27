import { Types } from 'mongoose';
import { PermissionBits, PrincipalType } from 'librechat-data-provider';

/**
 * 부서 그룹은 부여 대상 id 로만 쓴다. 누가 그 부서인지는 권한 판정 때 data-schemas
 * `getUserPrincipals` 가 `user.department` 로 정하고, 그룹의 memberIds 는 보지 않는다.
 */
export interface DepartmentGroupDeps {
  ensureDepartmentGroup: (department: string) => Promise<string>;
  findDepartmentGroupIds: (departments: string[]) => Promise<Record<string, string>>;
  listDepartmentGroupIds: () => Promise<Types.ObjectId[]>;
  findAccessibleResources: (
    principalsList: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    resourceType: string,
    requiredPermBit: number,
    resourceIds?: Types.ObjectId[],
  ) => Promise<Types.ObjectId[]>;
}

export interface DepartmentGroups {
  /** 부서 그룹 id. 없으면 구성원 없이 만든다. */
  ensureGroup: (department: string) => Promise<string>;
  findGroupIds: () => Promise<Set<string>>;
  /** 각 자원을 그 자원의 부서(작성자 부서) 그룹에 VIEW 로 부여했는지. 다른 부서 그룹 부여는 세지 않는다. */
  findSharedWithOwnDepartment: (
    resourceType: string,
    resources: Array<{ id: string | Types.ObjectId; department?: string }>,
  ) => Promise<Set<string>>;
}

function toObjectId(id: string | Types.ObjectId): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

export function createDepartmentGroups(deps: DepartmentGroupDeps): DepartmentGroups {
  async function findGroupIds(): Promise<Set<string>> {
    const ids = await deps.listDepartmentGroupIds();
    return new Set(ids.map((id) => id.toString()));
  }

  async function findSharedWithOwnDepartment(
    resourceType: string,
    resources: Array<{ id: string | Types.ObjectId; department?: string }>,
  ): Promise<Set<string>> {
    const idsByDepartment = new Map<string, Types.ObjectId[]>();
    for (const resource of resources) {
      if (!resource.department) {
        continue;
      }
      const ids = idsByDepartment.get(resource.department) ?? [];
      ids.push(toObjectId(resource.id));
      idsByDepartment.set(resource.department, ids);
    }
    if (idsByDepartment.size === 0) {
      return new Set();
    }
    const groupIds = await deps.findDepartmentGroupIds([...idsByDepartment.keys()]);
    const sharedLists = await Promise.all(
      Object.entries(groupIds).map(([department, groupId]) =>
        deps.findAccessibleResources(
          [{ principalType: PrincipalType.GROUP, principalId: toObjectId(groupId) }],
          resourceType,
          PermissionBits.VIEW,
          idsByDepartment.get(department) ?? [],
        ),
      ),
    );
    return new Set(sharedLists.flat().map((id) => id.toString()));
  }

  return {
    ensureGroup: deps.ensureDepartmentGroup,
    findGroupIds,
    findSharedWithOwnDepartment,
  };
}
