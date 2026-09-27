import type { TTaskResultsResponse } from './types/tasks';
import type { TSkillMetricsReport } from './types/skills';
import type * as t from './types';
import * as endpoints from './api-endpoints';
import * as service from './data-service';
import request from './request';

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('screen data endpoints', () => {
  it('builds the task results endpoint with an encoded cursor', () => {
    const cursor = 'next page/+';

    expect(endpoints.taskResults(cursor)).toBe(
      `${endpoints.apiBaseUrl()}/api/tasks/results?cursor=next%20page%2F%2B`,
    );
    expect(endpoints.taskResults(null)).toBe(`${endpoints.apiBaseUrl()}/api/tasks/results`);
  });

  it('builds the skill metrics and workspace preferences endpoints', () => {
    expect(endpoints.adminSkillMetrics()).toBe(
      `${endpoints.apiBaseUrl()}/api/admin/skills/metrics`,
    );
    expect(endpoints.workspacePreferences()).toBe(
      `${endpoints.apiBaseUrl()}/api/user/preferences/workspace`,
    );
  });
});

describe('screen data services', () => {
  it('gets a task results page using its cursor', async () => {
    const page: TTaskResultsResponse = {
      results: [
        {
          resultId: 'result-1',
          conversationId: 'conversation-1',
          conversationTitle: '주간 보고서',
          kind: 'table',
          title: '현황 표',
          rows: 4,
          createdAt: '2026-09-27T00:00:00.000Z',
        },
      ],
      nextCursor: 'next-page',
    };
    const get = jest.spyOn(request, 'get').mockResolvedValue(page);

    await expect(service.getTaskResults('next-page')).resolves.toEqual(page);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(endpoints.taskResults('next-page'));
  });

  it('gets administrator skill metrics', async () => {
    const metrics: TSkillMetricsReport = {
      agents: { total: 1, base: 0, staff: 1 },
      runs: { total: 3, staff: 3 },
      forks: { total: 1, forkedAgents: 1 },
      savedHours: { total: 0, staff: 0 },
      ranking: [
        {
          id: 'skill-1',
          name: 'weekly-report',
          displayTitle: '주간 보고서',
          authorName: '김민',
          authorDepartment: '정세분석팀',
          runs: 3,
          forks: 1,
          savedHours: null,
        },
      ],
      baseTotal: { count: 0, runs: 0, forks: 0, savedHours: 0 },
      contributors: [
        {
          authorName: '김민',
          department: '정세분석팀',
          agents: 1,
          runs: 3,
          forks: 1,
          savedHours: 0,
        },
      ],
    };
    const get = jest.spyOn(request, 'get').mockResolvedValue(metrics);

    await expect(service.getAdminSkillMetrics()).resolves.toEqual(metrics);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(endpoints.adminSkillMetrics());
  });

  it('gets workspace preferences', async () => {
    const preferences: t.TWorkspacePreferences = {
      instructions: '답변은 한국어로 작성합니다.',
      approvalMode: 'auto',
    };
    const get = jest.spyOn(request, 'get').mockResolvedValue(preferences);

    await expect(service.getWorkspacePreferences()).resolves.toEqual(preferences);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(endpoints.workspacePreferences());
  });

  it('patches workspace preferences', async () => {
    const payload: t.TUpdateWorkspacePreferencesRequest = { approvalMode: 'auto' };
    const response: t.TUpdateWorkspacePreferencesResponse = {
      updated: true,
      preferences: { instructions: '', approvalMode: 'auto' },
    };
    const patch = jest.spyOn(request, 'patch').mockResolvedValue(response);

    await expect(service.updateWorkspacePreferences(payload)).resolves.toEqual(response);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith(endpoints.workspacePreferences(), payload);
  });
});
