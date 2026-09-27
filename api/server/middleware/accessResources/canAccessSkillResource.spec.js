const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { PermissionBits } = require('librechat-data-provider');
const { initializeDeploymentSkills, getDeploymentSkillRegistry } = require('@librechat/api');
const { canAccessSkillResource } = require('./canAccessSkillResource');

let root;

async function writeSkill(name, metadata) {
  const dir = path.join(root, 'skill', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'SKILL.md'),
    [
      '---',
      `name: ${name}`,
      'description: A deployment skill used for department access tests.',
      'category: 정리·분석',
      'metadata:',
      ...metadata.map((line) => `  ${line}`),
      '---',
      '',
      `# ${name}`,
    ].join('\n'),
  );
}

function skillId(name) {
  return getDeploymentSkillRegistry()
    .list()
    .find((skill) => skill.name === name)
    ._id.toString();
}

function run(name, department) {
  const req = {
    params: { id: skillId(name) },
    user: { id: 'user-1', role: 'USER', ...(department && { department }) },
  };
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  const next = jest.fn();
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW })(req, res, next);
  return { req, res, next };
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-access-'));
  await writeSkill('team-rollup', ['department: "통일교육팀"', 'scope: 팀']);
  await writeSkill('open-report', ['department: "운영지원팀"', 'scope: 전 부서']);
  await initializeDeploymentSkills({ projectRoot: root, env: {} });
});

afterAll(async () => {
  const emptyRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-access-empty-'));
  await initializeDeploymentSkills({ projectRoot: emptyRoot, env: {} });
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(emptyRoot, { recursive: true, force: true });
});

describe('canAccessSkillResource for deployment skills', () => {
  it('lets the author department view a team-scoped deployment skill', () => {
    const { req, res, next } = run('team-rollup', '통일교육팀');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.resourceAccess.resourceInfo.name).toBe('team-rollup');
  });

  it('refuses a team-scoped deployment skill to another department', () => {
    const { req, res, next } = run('team-rollup', '운영지원팀');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(req.resourceAccess).toBeUndefined();
  });

  it('refuses a team-scoped deployment skill to a user without a department', () => {
    const { res, next } = run('team-rollup');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lets every department view a deployment skill open to all', () => {
    const { next } = run('open-report', '통일교육팀');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
