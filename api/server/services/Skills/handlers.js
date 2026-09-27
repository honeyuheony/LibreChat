const {
  createSkillsHandlers,
  createDepartmentGroups,
  isDeploymentSkillIdVisibleTo,
  findDeploymentTeamDepartments,
} = require('@librechat/api');
const { isValidObjectIdString } = require('@librechat/data-schemas');
const { PermissionBits } = require('librechat-data-provider');
const {
  createSkill,
  updateSkill,
  deleteSkill,
  deleteSkillFile,
  countPublishedForks,
  getDeploymentSkillUsage,
  getSkillAuthorDepartments,
} = require('~/models');
const {
  findAccessibleResources,
  findPubliclyAccessibleResources,
  hasPublicPermission,
  grantPermission,
} = require('~/server/services/PermissionService');
const {
  getSkillDbMethods,
  withDeploymentSkillIds,
  getSkillStrategyFunctions,
} = require('~/server/services/Endpoints/agents/skillDeps');
const db = require('~/models');

/** 부서 그룹 부여가 없는 `scope: 팀` 배포 스킬도 작성 부서의 「우리 팀」 배지를 받게 한다. */
function withDeploymentTeamDepartments(departmentGroups) {
  return {
    ...departmentGroups,
    findTeamDepartments: async (resourceType, ids) => {
      const granted = await departmentGroups.findTeamDepartments(resourceType, ids);
      return resourceType === 'skill'
        ? new Map([...findDeploymentTeamDepartments(ids), ...granted])
        : granted;
    },
  };
}

function getSkillsHandlers() {
  const skillDbMethods = getSkillDbMethods();
  return createSkillsHandlers({
    createSkill,
    getSkillById: skillDbMethods.getSkillById,
    listSkillsByAccess: skillDbMethods.listSkillsByAccess,
    updateSkill,
    deleteSkill,
    listSkillFiles: skillDbMethods.listSkillFiles,
    deleteSkillFile,
    getSkillFileByPath: skillDbMethods.getSkillFileByPath,
    updateSkillFileContent: skillDbMethods.updateSkillFileContent,
    getStrategyFunctions: getSkillStrategyFunctions,
    // 핸들러는 userId 만 넘기므로 팀 범위 배포 스킬을 가리려고 부서를 따로 읽는다.
    findAccessibleResources: async (params) => {
      if (params.resourceType !== 'skill' || params.requiredPermissions !== PermissionBits.VIEW) {
        return findAccessibleResources(params);
      }
      const [ids, user] = await Promise.all([
        findAccessibleResources(params),
        db.getUserById(params.userId, 'department'),
      ]);
      return withDeploymentSkillIds(ids, user);
    },
    // 사용자를 넘기지 않아 팀 범위 배포 스킬은 공개로 치지 않는다.
    findPubliclyAccessibleResources: async (params) =>
      params.resourceType === 'skill' && params.requiredPermissions === PermissionBits.VIEW
        ? withDeploymentSkillIds(await findPubliclyAccessibleResources(params))
        : findPubliclyAccessibleResources(params),
    hasPublicPermission: async (params) =>
      (params.resourceType === 'skill' && params.requiredPermissions === PermissionBits.VIEW
        ? isDeploymentSkillIdVisibleTo(params.resourceId)
        : undefined) ?? hasPublicPermission(params),
    grantPermission,
    isValidObjectIdString,
    countPublishedForks,
    getDeploymentSkillUsage,
    getSkillAuthorDepartments,
    departmentGroups: withDeploymentTeamDepartments(createDepartmentGroups(db)),
  });
}
module.exports = { getSkillsHandlers };
