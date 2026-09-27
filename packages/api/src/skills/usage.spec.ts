import { computeSkillUsageMetrics } from './usage';

describe('computeSkillUsageMetrics', () => {
  it('rounds saved minutes before calculating saved hours', () => {
    expect(
      computeSkillUsageMetrics({
        useCount: 120,
        runTimeTotalSeconds: 180,
        runTimeSampleCount: 4,
        manualMinutes: 30,
      }),
    ).toEqual({ averageRunSeconds: 45, savedMinutesPerRun: 29, savedHours: 58 });
  });

  it('never reports a negative saving when a run takes longer than the manual work', () => {
    expect(
      computeSkillUsageMetrics({
        useCount: 10,
        runTimeTotalSeconds: 600,
        runTimeSampleCount: 2,
        manualMinutes: 1,
      }),
    ).toEqual({ averageRunSeconds: 300, savedMinutesPerRun: 0, savedHours: 0 });
  });

  it('leaves savings empty without manual minutes', () => {
    expect(
      computeSkillUsageMetrics({ useCount: 3, runTimeTotalSeconds: 30, runTimeSampleCount: 3 }),
    ).toEqual({ averageRunSeconds: 10, savedMinutesPerRun: null, savedHours: null });
  });

  it('leaves every metric empty when no run was timed', () => {
    expect(computeSkillUsageMetrics({ useCount: 7, manualMinutes: 20 })).toEqual({
      averageRunSeconds: null,
      savedMinutesPerRun: null,
      savedHours: null,
    });
  });

  it('counts runs recorded before timing started when totalling saved hours', () => {
    const metrics = computeSkillUsageMetrics({
      useCount: 60,
      runTimeTotalSeconds: 60,
      runTimeSampleCount: 1,
      manualMinutes: 11,
    });
    expect(metrics.savedHours).toBe(10);
  });
});
