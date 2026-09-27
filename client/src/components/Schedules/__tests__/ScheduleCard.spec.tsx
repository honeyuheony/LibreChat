import { fireEvent, render, screen } from '@testing-library/react';
import type { TSchedule } from 'librechat-data-provider';
import ScheduleCard from '../ScheduleCard';

const mockUpdateSchedule = jest.fn();
const mockDeleteSchedule = jest.fn();
const mockRunSchedule = jest.fn();
const mockShowToast = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string | number>) =>
    values == null ? key : `${key}:${Object.values(values).join('|')}`,
}));
jest.mock('~/data-provider/Schedules', () => ({
  useUpdateScheduleMutation: () => ({ mutate: mockUpdateSchedule, isLoading: false }),
  useDeleteScheduleMutation: () => ({ mutate: mockDeleteSchedule, isLoading: false }),
  useRunScheduleNowMutation: () => ({ mutate: mockRunSchedule, isLoading: false }),
}));
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));
jest.mock('react-i18next', () => ({
  ...jest.requireActual('react-i18next'),
  useTranslation: () => ({ i18n: { language: 'ko-KR' } }),
}));

const schedule: TSchedule = {
  id: 'schedule-1',
  user: 'user-1',
  name: '주간보고 hwp 작성',
  prompt: 'hwp로 보고서 작성을 실행해 주세요.',
  agent_id: 'agent-1',
  cadence: { frequency: 'weekly', daysOfWeek: [1], hour: 9, minute: 0 },
  timezone: 'Asia/Seoul',
  target: 'new',
  skills: ['hwp-report'],
  chatProjectId: 'project-1',
  enabled: true,
  lastRun: { status: 'success', firedAt: '2026-09-08T00:00:00.000Z' },
  runCount: 1,
  failureCount: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
};

function renderCard() {
  render(
    <ScheduleCard
      schedule={schedule}
      skillNames={new Map([['hwp-report', 'hwp로 보고서 작성']])}
      projectName="주간보고 취합"
      canWrite={true}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('renders a schedule tile with its name, skill, project, cadence, last run and actions', () => {
  renderCard();

  expect(screen.getByRole('heading', { name: '주간보고 hwp 작성' })).toBeInTheDocument();
  expect(
    screen.getByText(
      'com_ui_schedules_card_detail:/hwp로 보고서 작성|주간보고 취합|com_ui_schedules_cadence_weekly_monday',
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/com_ui_schedules_last_run_line:.*\|com_ui_schedules_status_success/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('switch', { name: 'com_ui_schedule_enabled: 주간보고 hwp 작성' }),
  ).toBeChecked();
  expect(screen.getByRole('button', { name: 'com_ui_schedule_run_now' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'com_ui_delete' })).toBeInTheDocument();
});

test('runs the schedule from its tile', () => {
  renderCard();

  fireEvent.click(screen.getByRole('button', { name: 'com_ui_schedule_run_now' }));

  expect(mockRunSchedule).toHaveBeenCalledWith('schedule-1');
});

test('toggles the schedule from its tile', () => {
  renderCard();

  fireEvent.click(
    screen.getByRole('switch', { name: 'com_ui_schedule_enabled: 주간보고 hwp 작성' }),
  );

  expect(mockUpdateSchedule).toHaveBeenCalledWith({
    id: 'schedule-1',
    payload: { enabled: false },
  });
});

test('deletes the schedule from its tile without a confirmation dialog', () => {
  renderCard();

  fireEvent.click(screen.getByRole('button', { name: 'com_ui_delete' }));

  expect(mockDeleteSchedule).toHaveBeenCalledWith('schedule-1');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
