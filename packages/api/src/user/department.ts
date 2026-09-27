import { PermissionBits } from 'librechat-data-provider';
import type { Types } from 'mongoose';

/**
 * 부서 그룹은 부여 대상 id 로만 쓴다. 누가 그 부서인지는 권한 판정 때 data-schemas
 * `getUserPrincipals` 가 `user.department` 로 정하고, 그룹의 memberIds 는 보지 않는다.
 */
export interface DepartmentGroupDeps {
  ensureDepartmentGroup: (department: string) => Promise<string>;
  listDepartmentGroupIds: () => Promise<Types.ObjectId[]>;
  findDepartmentGrants: (
    resourceType: string,
    resourceIds: Array<string | Types.ObjectId>,
    permissionBit: number,
  ) => Promise<Array<{ resourceId: string; department: string }>>;
}

export interface DepartmentGroups {
  /** 부서 그룹 id. 없으면 구성원 없이 만든다. */
  ensureGroup: (department: string) => Promise<string>;
  findGroupIds: () => Promise<Set<string>>;
  /**
   * 자원 id 별로 VIEW 를 받은 부서. 부서 그룹 부여는 게시만 만들므로(관리자 검색·부여에서 빠짐)
   * 작성자 부서가 아닌 부서가 나오면 작성자가 게시 뒤 부서를 옮긴 경우다.
   */
  findTeamDepartments: (
    resourceType: string,
    resourceIds: Array<string | Types.ObjectId>,
  ) => Promise<Map<string, string>>;
}

export function createDepartmentGroups(deps: DepartmentGroupDeps): DepartmentGroups {
  async function findGroupIds(): Promise<Set<string>> {
    const ids = await deps.listDepartmentGroupIds();
    return new Set(ids.map((id) => id.toString()));
  }

  async function findTeamDepartments(
    resourceType: string,
    resourceIds: Array<string | Types.ObjectId>,
  ): Promise<Map<string, string>> {
    const grants = await deps.findDepartmentGrants(resourceType, resourceIds, PermissionBits.VIEW);
    return new Map(grants.map((grant) => [grant.resourceId, grant.department]));
  }

  return { ensureGroup: deps.ensureDepartmentGroup, findGroupIds, findTeamDepartments };
}
