const os = require('os');
const fs = require('fs');
const path = require('path');
const { initializeDeploymentSkills, getDeploymentSkillIds } = require('@librechat/api');

jest.mock('~/server/services/PermissionService', () => ({
  findAccessibleResources: jest.fn(async () => []),
}));

jest.mock('~/models', () => ({
  updateUser: jest.fn(async (_id, update) => update),
  getUserById: jest.fn(),
}));

const { updateUser } = require('~/models');
const { updateSkillStatesController } = require('./SkillStatesController');

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('updateSkillStatesController with a team deployment skill', () => {
  let root;
  let teamSkillId;

  beforeAll(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'skill-states-deployment-'));
    const skillDir = path.join(root, 'skill', 'center-rollup');
    await fs.promises.mkdir(skillDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: center-rollup',
        'description: Rolls up the education center weekly figures for the team.',
        'metadata:',
        '  department: "교육센터"',
        '  scope: 팀',
        '---',
        '',
        '# Center rollup',
      ].join('\n'),
    );
    await initializeDeploymentSkills({ projectRoot: root, env: {} });
    teamSkillId = getDeploymentSkillIds()[0].toString();
  });

  afterAll(async () => {
    await initializeDeploymentSkills({ projectRoot: path.join(root, 'empty'), env: {} });
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    updateUser.mockClear();
  });

  const activate = (department) =>
    updateSkillStatesController(
      {
        user: { id: 'user-1', role: 'USER', department },
        body: { skillStates: { [teamSkillId]: true } },
      },
      createRes(),
    );

  it('drops the activation for a user in another department', async () => {
    await activate('통일교육팀');
    expect(updateUser).toHaveBeenCalledWith('user-1', { skillStates: {} });
  });

  it('keeps the activation for a user in the authoring department', async () => {
    await activate('교육센터');
    expect(updateUser).toHaveBeenCalledWith('user-1', { skillStates: { [teamSkillId]: true } });
  });
});
