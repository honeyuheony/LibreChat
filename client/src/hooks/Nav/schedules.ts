import type { TInterfaceConfig } from 'librechat-data-provider';

export function isSchedulesEnabled(schedules: TInterfaceConfig['schedules']): boolean {
  return (
    schedules != null &&
    schedules !== false &&
    !(typeof schedules === 'object' && schedules.use === false)
  );
}
