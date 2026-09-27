import { fireEvent, render, screen } from '@testing-library/react';
import Schedules from '../index';

const mockRefetch = jest.fn();
const mockQueryState = {
  data: { schedules: [], limits: { maxPerUser: 10 } },
  dataUpdatedAt: 0,
  isError: false,
  isLoading: false,
  refetch: mockRefetch,
};

jest.mock('~/hooks', () => ({
  useHasAccess: () => false,
  useLocalize: () => (key: string, values?: Record<string, string | number>) =>
    values == null ? key : `${key}:${Object.values(values).join('|')}`,
}));
jest.mock('~/data-provider/Schedules', () => ({
  useSchedulesQuery: () => mockQueryState,
}));
jest.mock('~/data-provider/Skills', () => ({
  useSkillsInfiniteQuery: () => ({ data: undefined }),
}));
jest.mock('../../SidePanel/Schedules/useScheduleProjects', () => ({
  useChatProjectNames: () => new Map(),
}));
jest.mock('../../SidePanel/Schedules/useRunSync', () => ({
  __esModule: true,
  default: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryState.data = { schedules: [], limits: { maxPerUser: 10 } };
  mockQueryState.dataUpdatedAt = 0;
  mockQueryState.isError = false;
  mockQueryState.isLoading = false;
});

test('does not show a schedule tile when the list is empty', () => {
  render(<Schedules />);

  expect(screen.getByRole('heading', { name: 'com_ui_schedules_title' })).toBeInTheDocument();
  expect(screen.getByText('com_ui_schedules_empty')).toBeInTheDocument();
  expect(screen.queryByTestId('schedule-tile')).not.toBeInTheDocument();
});

test('shows loading skeletons while schedule data is loading', () => {
  mockQueryState.isLoading = true;
  render(<Schedules />);

  expect(screen.getByLabelText('com_ui_loading')).toHaveAttribute('aria-busy', 'true');
});

test('retries the schedule query after a load error', () => {
  mockQueryState.isError = true;
  render(<Schedules />);

  fireEvent.click(screen.getByRole('button', { name: 'com_ui_schedules_retry' }));

  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
