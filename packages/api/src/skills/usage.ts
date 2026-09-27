import type { TSkillUsageMetrics } from 'librechat-data-provider';

/** 스킬 문서에 저장하는 원래 값. 계산식이 바뀌어도 이 값은 그대로 두고 응답만 다시 계산한다. */
export interface SkillUsageCounters {
  useCount?: number;
  runTimeTotalSeconds?: number;
  runTimeSampleCount?: number;
  manualMinutes?: number;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeSkillSavedTime(params: {
  runs: number;
  averageRunSeconds: number;
  manualMinutes: number;
}): { savedMinutesPerRun: number; savedHours: number } {
  const savedMinutesPerRun = Math.max(
    0,
    Math.round(params.manualMinutes - params.averageRunSeconds / 60),
  );
  return {
    savedMinutesPerRun,
    savedHours: Math.round((Math.max(0, params.runs) * savedMinutesPerRun) / 60),
  };
}

/** 절감 시간 = 실행 수 × max(0, 수작업 분 − 평균 실행 초 / 60). 평균은 측정된 실행만으로 낸다. */
export function computeSkillUsageMetrics(counters: SkillUsageCounters): TSkillUsageMetrics {
  const runs = Math.max(0, counters.useCount ?? 0);
  const samples = counters.runTimeSampleCount ?? 0;
  const averageRunSeconds = samples > 0 ? (counters.runTimeTotalSeconds ?? 0) / samples : null;
  const manualMinutes = counters.manualMinutes;
  // 측정 기록이 없을 때 0초로 가정하면 수작업 분 전체가 절감된 것처럼 부풀려지므로 비워 둔다.
  if (averageRunSeconds == null || manualMinutes == null) {
    return {
      averageRunSeconds: averageRunSeconds == null ? null : roundToTenth(averageRunSeconds),
      savedMinutesPerRun: null,
      savedHours: null,
    };
  }
  const savedMinutesPerRun = Math.max(0, manualMinutes - averageRunSeconds / 60);
  return {
    averageRunSeconds: roundToTenth(averageRunSeconds),
    savedMinutesPerRun: roundToTenth(savedMinutesPerRun),
    savedHours: roundToTenth((runs * savedMinutesPerRun) / 60),
  };
}
