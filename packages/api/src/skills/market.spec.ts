import { logger } from '@librechat/data-schemas';
import { isDeploymentSkillVisibleTo, isVisibleToDepartment } from './market';

describe('isVisibleToDepartment', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('shows a skill open to every department or with no scope to everyone', () => {
    expect(isVisibleToDepartment({ marketProfile: { scope: '전 부서' } }, undefined)).toBe(true);
    expect(isVisibleToDepartment({}, '운영지원팀')).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('shows a team skill only to the author department', () => {
    const skill = { marketProfile: { scope: '팀' }, authorDepartment: '통일교육팀' };
    expect(isVisibleToDepartment(skill, '통일교육팀')).toBe(true);
    expect(isVisibleToDepartment(skill, '운영지원팀')).toBe(false);
    expect(isVisibleToDepartment(skill, undefined)).toBe(false);
  });

  it('hides a skill whose scope is not a known value and warns once per value', () => {
    const skill = { marketProfile: { scope: '나만-오타' }, authorDepartment: '통일교육팀' };
    expect(isVisibleToDepartment(skill, '통일교육팀')).toBe(false);
    expect(isDeploymentSkillVisibleTo(skill, { department: '통일교육팀' })).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('나만-오타');
  });
});
