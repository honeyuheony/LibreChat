import type { TScheduleCadence } from 'librechat-data-provider';
import type { ScheduleCadenceOptionKey } from '../cadence';
import { createScheduleCadence, getScheduleCadenceLabelKey } from '../cadence';

const presets: Array<{
  key: ScheduleCadenceOptionKey;
  labelKey: string;
  cadence: TScheduleCadence;
}> = [
  {
    key: 'daily',
    labelKey: 'com_ui_schedules_cadence_daily',
    cadence: { frequency: 'daily', hour: 9, minute: 0 },
  },
  {
    key: 'weekly-monday',
    labelKey: 'com_ui_schedules_cadence_weekly_monday',
    cadence: { frequency: 'weekly', daysOfWeek: [1], hour: 9, minute: 0 },
  },
  {
    key: 'weekly-friday',
    labelKey: 'com_ui_schedules_cadence_weekly_friday',
    cadence: { frequency: 'weekly', daysOfWeek: [5], hour: 17, minute: 0 },
  },
  {
    key: 'monthly',
    labelKey: 'com_ui_schedules_cadence_monthly',
    cadence: { frequency: 'cron', expression: '0 9 1 * *' },
  },
];

describe('schedule cadence', () => {
  test('shows the four preset labels for their stored values', () => {
    const labels = presets.map(({ cadence }) => getScheduleCadenceLabelKey(cadence));
    const savedCadences = presets.map(({ key }) => createScheduleCadence(key));

    expect(savedCadences).toEqual(presets.map(({ cadence }) => cadence));
    expect(labels).toEqual(presets.map(({ labelKey }) => labelKey));
  });
});
