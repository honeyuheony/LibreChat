import { Types } from 'mongoose';
import { Constants } from '@librechat/agents';
import { recordTurnSkillRuns } from './skillRuns';

function skillToolCall(skillName: string) {
  return {
    type: 'tool_call',
    tool_call: { name: Constants.SKILL_TOOL, args: JSON.stringify({ skillName }) },
  };
}

describe('recordTurnSkillRuns', () => {
  const accessibleSkillIds = [new Types.ObjectId()];

  it('records manual primes and model-invoked skills once each with the turn seconds', async () => {
    const manualId = new Types.ObjectId();
    const modelId = new Types.ObjectId();
    const recordSkillRuns = jest.fn().mockResolvedValue(undefined);
    const getSkillByName = jest.fn().mockResolvedValue({ _id: modelId });

    const recorded = await recordTurnSkillRuns({
      manualSkillPrimes: [{ _id: manualId, name: 'weekly-report' }],
      contentParts: [
        skillToolCall('meeting-notes'),
        skillToolCall('meeting-notes'),
        skillToolCall('weekly-report'),
      ],
      accessibleSkillIds,
      durationMs: 90_000,
      getSkillByName,
      recordSkillRuns,
    });

    expect(recorded).toEqual([manualId.toString(), modelId.toString()]);
    expect(getSkillByName).toHaveBeenCalledTimes(1);
    expect(getSkillByName).toHaveBeenCalledWith('meeting-notes', accessibleSkillIds, {
      preferModelInvocable: true,
    });
    expect(recordSkillRuns).toHaveBeenCalledWith([manualId, modelId], 90);
  });

  it('skips deployment skills and names that no longer resolve', async () => {
    const recordSkillRuns = jest.fn().mockResolvedValue(undefined);
    const getSkillByName = jest
      .fn()
      .mockResolvedValueOnce({ _id: new Types.ObjectId(), deployment: true })
      .mockResolvedValueOnce(null);

    const recorded = await recordTurnSkillRuns({
      contentParts: [skillToolCall('bundled-skill'), skillToolCall('deleted-skill')],
      accessibleSkillIds,
      durationMs: 1_000,
      getSkillByName,
      recordSkillRuns,
    });

    expect(recorded).toEqual([]);
    expect(recordSkillRuns).not.toHaveBeenCalled();
  });

  it('does not count a turn that used no skill', async () => {
    const recordSkillRuns = jest.fn();
    const recorded = await recordTurnSkillRuns({
      contentParts: [{ type: 'text', text: 'hello' }],
      accessibleSkillIds,
      durationMs: 5_000,
      recordSkillRuns,
    });
    expect(recorded).toEqual([]);
    expect(recordSkillRuns).not.toHaveBeenCalled();
  });

  it('passes a storage failure back to the caller', async () => {
    const manualId = new Types.ObjectId();
    await expect(
      recordTurnSkillRuns({
        manualSkillPrimes: [{ _id: manualId, name: 'weekly-report' }],
        durationMs: 1_000,
        recordSkillRuns: jest.fn().mockRejectedValue(new Error('db down')),
      }),
    ).rejects.toThrow('db down');
  });
});
