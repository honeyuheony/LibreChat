import { fireEvent, render, screen, within } from '@testing-library/react';
import { pageTopBarClassName, pageTitleTopClassName } from '~/components/ui/topbar';
import Schedules from '../index';

const mockRefetch = jest.fn();
let mockCanCreate = false;
const mockQueryState = {
  data: { schedules: [], limits: { maxPerUser: 10 } },
  dataUpdatedAt: 0,
  isError: false,
  isLoading: false,
  refetch: mockRefetch,
};

jest.mock('~/hooks', () => ({
  useHasAccess: () => mockCanCreate,
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
  mockCanCreate = false;
  mockQueryState.data = { schedules: [], limits: { maxPerUser: 10 } };
  mockQueryState.dataUpdatedAt = 0;
  mockQueryState.isError = false;
  mockQueryState.isLoading = false;
});

test('places the create action in the top bar and keeps the content narrow', () => {
  mockCanCreate = true;
  render(<Schedules />);

  const createButton = screen.getByRole('button', { name: 'com_ui_schedule_new' });
  const toolbar = createButton.closest('header');
  expect(toolbar).toBeInTheDocument();
  if (toolbar == null) {
    return;
  }

  expect(toolbar).toHaveClass('h-12');
  expect(createButton).toHaveClass(
    'h-7',
    'text-[13px]',
    'font-normal',
    'rounded-theme-control-round',
  );
  expect(createButton).toHaveClass('bg-surface-primary', 'border-border-medium');
  expect(within(toolbar).getByText('com_ui_schedules_title')).toBeInTheDocument();
  const content = screen.getByRole('region', { name: 'com_ui_schedules_title' });
  expect(
    within(content).queryByRole('button', { name: 'com_ui_schedule_new' }),
  ).not.toBeInTheDocument();
  expect(content).toHaveClass('max-w-[760px]', 'px-6');
  expect(content.parentElement).toHaveClass('bg-surface-secondary');
  expect(content).not.toContainElement(createButton);
});

test('shares the sticky page top bar and the 22px bold page title', () => {
  render(<Schedules />);

  expect(screen.getByRole('banner')).toHaveClass(...pageTopBarClassName.split(' '));
  const title = screen.getByRole('heading', { level: 1, name: 'com_ui_schedules_title' });
  expect(title).toHaveClass('text-[22px]', 'font-bold', 'leading-[1.25]');
  expect(title).not.toHaveClass('text-xl', 'font-semibold');
  const content = screen.getByRole('region', { name: 'com_ui_schedules_title' });
  expect(content).toHaveClass(pageTitleTopClassName);
  expect(content).not.toHaveClass('py-4');
  expect(screen.getByText('com_ui_schedules_description')).toHaveClass(
    'text-[13px]',
    'leading-[1.5]',
    'text-text-muted',
  );
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
