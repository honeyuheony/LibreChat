import type { TScheduleCadence } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import type { LocalizeFunction } from '~/common';
import { describeCadence } from '../SidePanel/Schedules/cadence';

export type ScheduleCadenceOptionKey = 'daily' | 'weekly-monday' | 'weekly-friday' | 'monthly';

export const SCHEDULE_CADENCE_OPTIONS: Array<{
  key: ScheduleCadenceOptionKey;
  labelKey: string;
}> = [
  { key: 'daily', labelKey: 'com_ui_schedules_cadence_daily' },
  { key: 'weekly-monday', labelKey: 'com_ui_schedules_cadence_weekly_monday' },
  { key: 'weekly-friday', labelKey: 'com_ui_schedules_cadence_weekly_friday' },
  { key: 'monthly', labelKey: 'com_ui_schedules_cadence_monthly' },
];

export const DEFAULT_SCHEDULE_CADENCE: ScheduleCadenceOptionKey = 'weekly-monday';
export const SCHEDULE_TIMEZONE = 'Asia/Seoul';

export function createScheduleCadence(key: ScheduleCadenceOptionKey): TScheduleCadence {
  if (key === 'daily') {
    return { frequency: 'daily', hour: 9, minute: 0 };
  }
  if (key === 'weekly-monday') {
    return { frequency: 'weekly', daysOfWeek: [1], hour: 9, minute: 0 };
  }
  if (key === 'weekly-friday') {
    return { frequency: 'weekly', daysOfWeek: [5], hour: 17, minute: 0 };
  }
  return { frequency: 'cron', expression: '0 9 1 * *' };
}

export function getScheduleCadenceLabelKey(cadence: TScheduleCadence): string | undefined {
  if (cadence.frequency === 'daily' && cadence.hour === 9 && cadence.minute === 0) {
    return 'com_ui_schedules_cadence_daily';
  }
  if (
    cadence.frequency === 'weekly' &&
    cadence.daysOfWeek?.length === 1 &&
    cadence.daysOfWeek[0] === 1 &&
    cadence.hour === 9 &&
    cadence.minute === 0
  ) {
    return 'com_ui_schedules_cadence_weekly_monday';
  }
  if (
    cadence.frequency === 'weekly' &&
    cadence.daysOfWeek?.length === 1 &&
    cadence.daysOfWeek[0] === 5 &&
    cadence.hour === 17 &&
    cadence.minute === 0
  ) {
    return 'com_ui_schedules_cadence_weekly_friday';
  }
  if (cadence.frequency === 'cron' && cadence.expression === '0 9 1 * *') {
    return 'com_ui_schedules_cadence_monthly';
  }
  return undefined;
}

export function formatScheduleCadence(
  cadence: TScheduleCadence,
  localize: LocalizeFunction,
  locale?: string,
): string {
  const labelKey = getScheduleCadenceLabelKey(cadence);
  return labelKey != null
    ? localize(labelKey as TranslationKeys)
    : describeCadence(cadence, localize, locale);
}
