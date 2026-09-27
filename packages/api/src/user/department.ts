import { Types } from 'mongoose';
import { tenantStorage } from '@librechat/data-schemas';
import { PermissionBits, PrincipalType } from 'librechat-data-provider';
import { readUserDepartment } from '~/skills/market';

/**
 * 부서 그룹은 `source: 'local'`, `idOnTheSource: 'department:<부서>'` 인 그룹이다.
 * 사람이 만든 local 그룹에는 `idOnTheSource` 가 없으므로 섞이지 않는다.
 */
export const DEPARTMENT_GROUP_PREFIX: string = 'department:';

export function departmentGroupKey(department: string): string {
  return `${DEPARTMENT_GROUP_PREFIX}${department}`;
}

/** data-schemas `createMethods` 결과 중 부서 그룹에 쓰는 메서드. */
export interface DepartmentGroupDeps {
  setGroupMembersByDepartment: (params: {
    idOnTheSource: string;
    department: string;
  }) => Promise<{ _id: Types.ObjectId } | null>;
  syncUserLocalGroupMembership: (params: {
    userId: string | Types.ObjectId;
    idOnTheSource?: string | null;
    prefix: string;
    target: { idOnTheSource: string; name: string } | null;
  }) => Promise<{ changed: boolean; groupId?: string }>;
  findLocalGroupIdsByPrefix: (prefix: string) => Promise<Types.ObjectId[]>;
  findAccessibleResources: (
    principalsList: Array<{ principalType: string; principalId?: string | Types.ObjectId }>,
    resourceType: string,
    requiredPermBit: number,
    resourceIds?: Types.ObjectId[],
  ) => Promise<Types.ObjectId[]>;
}

export interface DepartmentUser {
  _id?: string | Types.ObjectId;
  id?: string;
  department?: unknown;
  idOnTheSource?: string | null;
  tenantId?: string;
}

export interface DepartmentGroups {
  /** 부서 사용자 전원을 구성원으로 맞춘 그룹의 id. 부서가 비어 있으면 null. */
  syncDepartment: (department: string) => Promise<string | null>;
  /** 사용자를 지금 부서의 그룹 하나에만 두고, 부서가 없으면 모든 부서 그룹에서 뺀다. */
  syncUser: (user: DepartmentUser) => Promise<void>;
  findGroupIds: () => Promise<Set<string>>;
  /** `resourceIds` 중 부서 그룹에 VIEW 가 부여된 것. */
  findSharedResourceIds: (
    resourceType: string,
    resourceIds: Array<string | Types.ObjectId>,
  ) => Promise<Set<string>>;
}

export function createDepartmentGroups(deps: DepartmentGroupDeps): DepartmentGroups {
  async function syncDepartment(department: string): Promise<string | null> {
    const name = readUserDepartment({ department });
    if (!name) {
      return null;
    }
    const group = await deps.setGroupMembersByDepartment({
      idOnTheSource: departmentGroupKey(name),
      department: name,
    });
    return group?._id.toString() ?? null;
  }

  async function syncUser(user: DepartmentUser): Promise<void> {
    const userId = user._id ?? user.id;
    if (!userId) {
      return;
    }
    const department = readUserDepartment(user);
    const sync = async () => {
      await deps.syncUserLocalGroupMembership({
        userId,
        idOnTheSource: user.idOnTheSource ?? null,
        prefix: DEPARTMENT_GROUP_PREFIX,
        target: department
          ? { idOnTheSource: departmentGroupKey(department), name: department }
          : null,
      });
    };
    /** 로그인 경로에는 tenant 문맥이 없을 수 있어, 그룹을 사용자의 tenant 에 만들도록 문맥을 연다. */
    if (user.tenantId) {
      await tenantStorage.run({ tenantId: user.tenantId }, sync);
      return;
    }
    await sync();
  }

  async function findGroupIds(): Promise<Set<string>> {
    const ids = await deps.findLocalGroupIdsByPrefix(DEPARTMENT_GROUP_PREFIX);
    return new Set(ids.map((id) => id.toString()));
  }

  async function findSharedResourceIds(
    resourceType: string,
    resourceIds: Array<string | Types.ObjectId>,
  ): Promise<Set<string>> {
    if (resourceIds.length === 0) {
      return new Set();
    }
    const groupIds = await deps.findLocalGroupIdsByPrefix(DEPARTMENT_GROUP_PREFIX);
    if (groupIds.length === 0) {
      return new Set();
    }
    const shared = await deps.findAccessibleResources(
      groupIds.map((principalId) => ({ principalType: PrincipalType.GROUP, principalId })),
      resourceType,
      PermissionBits.VIEW,
      resourceIds.map((id) => (typeof id === 'string' ? new Types.ObjectId(id) : id)),
    );
    return new Set(shared.map((id) => id.toString()));
  }

  return { syncDepartment, syncUser, findGroupIds, findSharedResourceIds };
}
