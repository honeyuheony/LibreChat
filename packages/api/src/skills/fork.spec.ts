import { Types } from 'mongoose';
import { Readable } from 'stream';
import { SKILL_NAME_MAX_LENGTH } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';
import type { ForkSkillDeps } from './fork';
import { createForkSkillHandler, forkNameCandidates } from './fork';

jest.mock('~/middleware/tenant', () => ({ resolveRequestTenantId: () => undefined }));

describe('forkNameCandidates', () => {
  it('tries the original name first, then -fork suffixes', () => {
    expect(forkNameCandidates('weekly-report').slice(0, 3)).toEqual([
      'weekly-report',
      'weekly-report-fork',
      'weekly-report-fork-2',
    ]);
  });

  it('keeps suffixed names within the name length limit', () => {
    const longName = `${'a'.repeat(SKILL_NAME_MAX_LENGTH - 5)}-bbbb`;
    const candidates = forkNameCandidates(longName);
    expect(candidates[0]).toBe(longName);
    for (const name of candidates) {
      expect(name.length).toBeLessThanOrEqual(SKILL_NAME_MAX_LENGTH);
      expect(name).not.toMatch(/--/);
    }
    expect(candidates[1]).toBe(`${'a'.repeat(SKILL_NAME_MAX_LENGTH - 5)}-fork`);
  });
});

describe('createForkSkillHandler', () => {
  function createResponse() {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
  }

  it('reports a file that could not be copied and still counts the fork', async () => {
    const originalId = new Types.ObjectId();
    const forkedId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const original = {
      _id: originalId,
      name: 'weekly-report',
      description: 'Summarizes the week for the team.',
      body: '# Weekly',
      frontmatter: {},
      author: new Types.ObjectId(),
      authorName: 'Owner',
      version: 3,
      source: 'inline' as const,
      fileCount: 2,
      alwaysApply: false,
      manualMinutes: 25,
    };
    const forked = { ...original, _id: forkedId, author: userId, forkOf: originalId, version: 1 };
    const deps: ForkSkillDeps = {
      getSkillById: jest
        .fn()
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce({ ...forked, fileCount: 1 }),
      listSkillFiles: jest.fn().mockResolvedValue([
        { relativePath: 'ok.md', filename: 'ok.md', mimeType: 'text/markdown', source: 'local' },
        { relativePath: 'lost.md', filename: 'lost.md', mimeType: 'text/markdown', source: 'gone' },
      ]),
      getStrategyFunctions: jest.fn((source: string) =>
        source === 'local'
          ? { getDownloadStream: jest.fn().mockResolvedValue(Readable.from([Buffer.from('ok')])) }
          : {},
      ) as unknown as ForkSkillDeps['getStrategyFunctions'],
      createSkill: jest.fn().mockResolvedValue({ skill: forked, warnings: [] }),
      deleteSkill: jest.fn(),
      upsertSkillFile: jest.fn().mockResolvedValue({}),
      saveBuffer: jest.fn().mockResolvedValue({ filepath: '/uploads/ok.md', source: 'local' }),
      deleteFile: jest.fn(),
      grantPermission: jest.fn().mockResolvedValue(undefined),
      incrementSkillForkCount: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };
    const req = {
      params: { id: originalId.toString() },
      body: {},
      user: { id: userId.toString(), _id: userId, name: 'Forker' },
    } as unknown as ServerRequest;
    const res = createResponse();

    await createForkSkillHandler(deps)(req, res as unknown as Response);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.forkOf).toBe(originalId.toString());
    expect(body._forkSummary).toEqual({
      filesProcessed: 2,
      filesSucceeded: 1,
      filesFailed: 1,
      errors: [expect.objectContaining({ path: 'lost.md', status: 'error' })],
    });
    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'weekly-report', forkOf: originalId, manualMinutes: 25 }),
    );
    expect(deps.saveBuffer).toHaveBeenCalledTimes(1);
    expect(deps.incrementSkillForkCount).toHaveBeenCalledWith(originalId);
  });
});
