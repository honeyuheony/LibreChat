import { fireEvent, render, screen } from '@testing-library/react';
import type { TSkillSummary } from 'librechat-data-provider';
import ScheduleDialog from '../ScheduleDialog';

const mockCreateSchedule = jest.fn();
const mockShowToast = jest.fn();
const mockSkills: TSkillSummary[] = [
  {
    _id: 'weekly-report-id',
    name: 'weekly-report',
    displayTitle: '주간보고 작성',
    description: '주간보고를 작성합니다.',
    author: 'user-1',
    authorName: '홍길동',
    version: 1,
    source: 'inline',
    fileCount: 0,
    userInvocable: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    _id: 'inactive-skill-id',
    name: 'inactive-skill',
    displayTitle: '꺼진 스킬',
    description: '꺼진 스킬입니다.',
    author: 'user-1',
    authorName: '홍길동',
    version: 1,
    source: 'inline',
    fileCount: 0,
    userInvocable: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    _id: 'shared-skill-id',
    name: 'shared-report',
    displayTitle: '공유 보고서',
    description: '공유 보고서를 작성합니다.',
    author: 'user-2',
    authorName: '이협력',
    version: 1,
    source: 'inline',
    fileCount: 0,
    userInvocable: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
  useLocalize: () => (key: string, values?: Record<string, string | number>) =>
    values == null ? key : `${key}:${Object.values(values).join('|')}`,
}));
jest.mock('~/hooks/Skills/useSkillActiveState', () => ({
  __esModule: true,
  default: () => ({
    isActive: (skill: TSkillSummary) => skill._id !== 'inactive-skill-id',
    isError: false,
    isLoading: false,
  }),
}));
jest.mock('~/data-provider/Agents', () => ({
  useListAgentsQuery: () => ({
    data: [{ id: 'agent-1' }],
    isError: false,
    isLoading: false,
  }),
}));
jest.mock('~/data-provider/Skills', () => ({
  useSkillsInfiniteQuery: () => ({
    data: { pages: [{ skills: mockSkills }] },
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
  }),
}));
jest.mock('~/data-provider/Schedules', () => ({
  useCreateScheduleMutation: () => ({ mutate: mockCreateSchedule, isLoading: false }),
}));
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

function renderDialog() {
  render(<ScheduleDialog open={true} onOpenChange={jest.fn()} isAtLimit={false} />);
}

test('shows only active skills and the four cadence choices', () => {
  renderDialog();

  expect(
    screen.getByRole('combobox', { name: 'com_ui_schedules_agent_label' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'com_ui_schedule_frequency' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '주간보고 작성' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '꺼진 스킬' })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: '공유 보고서 · 이협력' })).toBeInTheDocument();
  expect(
    screen.getByRole('option', { name: 'com_ui_schedules_cadence_daily' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('option', { name: 'com_ui_schedules_cadence_weekly_monday' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('option', { name: 'com_ui_schedules_cadence_weekly_friday' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('option', { name: 'com_ui_schedules_cadence_monthly' }),
  ).toBeInTheDocument();
});

test('creates a Monday schedule with the selected skill and Seoul timezone', () => {
  renderDialog();

  fireEvent.click(screen.getByRole('button', { name: 'com_ui_create' }));

  expect(mockCreateSchedule).toHaveBeenCalledWith(
    expect.objectContaining({
      name: '주간보고 작성',
      prompt: '주간보고 작성을 실행해 주세요.',
      agent_id: 'agent-1',
      cadence: { frequency: 'weekly', daysOfWeek: [1], hour: 9, minute: 0 },
      timezone: 'Asia/Seoul',
      target: 'new',
      enabled: true,
      skills: ['weekly-report'],
      clientRequestId: expect.any(String),
    }),
  );
});

test('creates the selected monthly cadence as a cron expression', () => {
  renderDialog();
  fireEvent.change(screen.getByRole('combobox', { name: 'com_ui_schedule_frequency' }), {
    target: { value: 'monthly' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'com_ui_create' }));

  expect(mockCreateSchedule).toHaveBeenCalledWith(
    expect.objectContaining({
      cadence: { frequency: 'cron', expression: '0 9 1 * *' },
    }),
  );
});
