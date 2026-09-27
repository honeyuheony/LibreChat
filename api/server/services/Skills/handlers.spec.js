const os = require('os');
const fs = require('fs');
const path = require('path');
const { PermissionBits, ResourceType } = require('librechat-data-provider');

const mockCreateSkillsHandlers = jest.fn(() => ({}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  createSkillsHandlers: (deps) => mockCreateSkillsHandlers(deps),
}));

jest.mock('~/server/services/PermissionService', () => ({
  findAccessibleResources: jest.fn(async () => []),
  findPubliclyAccessibleResources: jest.fn(async () => []),
  hasPublicPermission: jest.fn(async () => false),
  grantPermission: jest.fn(),
}));

jest.mock('~/server/services/Endpoints/agents/skillDeps', () => {
  const { mergeDeploymentSkillIds } = jest.requireActual('@librechat/api');
  return {
    getSkillDbMethods: () => ({}),
    getSkillStrategyFunctions: jest.fn(),
    withDeploymentSkillIds: (ids = [], user) => mergeDeploymentSkillIds(ids, user),
  };
});

jest.mock('~/models', () => ({
  getUserById: jest.fn(),
  ensureDepartmentGroup: jest.fn(),
  listDepartmentGroupIds: jest.fn(async () => []),
  findDepartmentGrants: jest.fn(async () => []),
}));

const { initializeDeploymentSkills, getDeploymentSkillRegistry } = require('@librechat/api');
const {
  hasPublicPermission,
  findAccessibleResources,
  findPubliclyAccessibleResources,
} = require('~/server/services/PermissionService');
const { getUserById } = require('~/models');
const { getSkillsHandlers } = require('./handlers');

const skillView = { resourceType: ResourceType.SKILL, requiredPermissions: PermissionBits.VIEW };

async function writeScopedSkill(root, name, scope) {
  const skillDir = path.join(root, 'skill', name);
  await fs.promises.mkdir(skillDir, { recursive: true });
  await fs.promises.writeFile(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      `name: ${name}`,
      'description: Rolls up the education center weekly figures for the team.',
      'metadata:',
      '  department: "교육센터"',
      `  scope: ${scope}`,
      '---',
      '',
      `# ${name}`,
    ].join('\n'),
  );
}

describe('skill handler deps with scoped deployment skills', () => {
  let root;
  let deps;
  let teamId;
  let allId;

  beforeAll(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'skill-handlers-deployment-'));
    await writeScopedSkill(root, 'center-rollup', '팀');
    await writeScopedSkill(root, 'shared-report', '전 부서');
    await initializeDeploymentSkills({ projectRoot: root, env: {} });
    const idByName = new Map(
      getDeploymentSkillRegistry()
        .list()
        .map((skill) => [skill.name, skill._id.toString()]),
    );
    teamId = idByName.get('center-rollup');
    allId = idByName.get('shared-report');
    getSkillsHandlers();
    deps = mockCreateSkillsHandlers.mock.calls[0][0];
  });

  afterAll(async () => {
    await initializeDeploymentSkills({ projectRoot: path.join(root, 'empty'), env: {} });
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  const toStrings = (ids) => ids.map((id) => id.toString());

  it('does not count a team deployment skill as public', async () => {
    await expect(deps.hasPublicPermission({ ...skillView, resourceId: teamId })).resolves.toBe(
      false,
    );
    await expect(deps.hasPublicPermission({ ...skillView, resourceId: allId })).resolves.toBe(true);
  });

  it('leaves a team deployment skill out of the public ids', async () => {
    const ids = toStrings(await deps.findPubliclyAccessibleResources(skillView));
    expect(ids).toEqual([allId]);
  });

  it('gives a team deployment skill to a user in the authoring department', async () => {
    getUserById.mockResolvedValueOnce({ department: '교육센터' });
    const ids = toStrings(await deps.findAccessibleResources({ ...skillView, userId: 'u1' }));
    expect(ids).toEqual(expect.arrayContaining([teamId, allId]));
    expect(getUserById).toHaveBeenLastCalledWith('u1', 'department');
  });

  it('keeps a team deployment skill from a user in another department', async () => {
    getUserById.mockResolvedValueOnce({ department: '통일교육팀' });
    const ids = toStrings(await deps.findAccessibleResources({ ...skillView, userId: 'u2' }));
    expect(ids).toEqual([allId]);
  });

  describe('when the ACL already lists a team deployment skill', () => {
    it('still does not count it as public', async () => {
      hasPublicPermission.mockResolvedValueOnce(true);
      await expect(deps.hasPublicPermission({ ...skillView, resourceId: teamId })).resolves.toBe(
        false,
      );
    });

    it('still leaves it out of the public ids', async () => {
      findPubliclyAccessibleResources.mockResolvedValueOnce([teamId]);
      const ids = toStrings(await deps.findPubliclyAccessibleResources(skillView));
      expect(ids).toEqual([allId]);
    });

    it('still keeps it from a user in another department', async () => {
      findAccessibleResources.mockResolvedValueOnce([teamId]);
      getUserById.mockResolvedValueOnce({ department: '통일교육팀' });
      const ids = toStrings(await deps.findAccessibleResources({ ...skillView, userId: 'u3' }));
      expect(ids).toEqual([allId]);
    });
  });

  it('labels a team deployment skill with its authoring department', async () => {
    const departments = await deps.departmentGroups.findTeamDepartments(ResourceType.SKILL, [
      teamId,
      allId,
    ]);
    expect(Object.fromEntries(departments)).toEqual({ [teamId]: '교육센터' });
  });
});
