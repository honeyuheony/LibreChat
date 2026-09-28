import React from 'react';
import userEvent from '@testing-library/user-event';
import { dataService } from 'librechat-data-provider';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { TSkillMetricsReport } from 'librechat-data-provider';
import MetricsView from '~/components/Metrics/MetricsView';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getAdminSkillMetrics: jest.fn(),
    },
  };
});

const getMetrics = jest.mocked(dataService.getAdminSkillMetrics);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en', resolvedLanguage: 'en' } }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, string | number>) =>
    options
      ? `${key}:${Object.entries(options)
          .map(([name, value]) => `${name}=${value}`)
          .join(',')}`
      : key,
}));

const metricsReport: TSkillMetricsReport = {
  agents: { total: 5, base: 3, staff: 2 },
  runs: { total: 89_234, staff: 5_467 },
  forks: { total: 14, forkedAgents: 4 },
  savedHours: { total: 38, staff: 12 },
  ranking: [
    {
      id: 'skill-1',
      name: 'weekly-report',
      displayTitle: '주간보고 요약',
      authorName: '김민서',
      authorDepartment: '정세분석팀',
      runs: 5_422,
      forks: 7,
      savedHours: 12,
    },
    {
      id: 'skill-2',
      name: 'draft-check',
      authorName: '한지우',
      runs: 45,
      forks: 1,
      savedHours: null,
    },
  ],
  baseTotal: {
    count: 3,
    authorName: '디지털혁신팀',
    runs: 83_767,
    forks: 7,
    savedHours: 26,
  },
  contributors: [
    {
      authorName: '김민서',
      department: '정세분석팀',
      agents: 1,
      runs: 5_422,
      forks: 7,
      savedHours: 12,
    },
    {
      authorName: '한지우',
      department: '교류협력팀',
      agents: 1,
      runs: 45,
      forks: 1,
      savedHours: 0,
    },
  ],
};

function renderMetrics() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/operations', element: <MetricsView /> },
      { path: '/skills/:skillId', element: <div data-testid="skill-detail" /> },
    ],
    { initialEntries: ['/operations'] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

describe('MetricsView', () => {
  beforeEach(() => getMetrics.mockReset());

  it('renders the four metrics, rankings, and base-agent totals', async () => {
    getMetrics.mockResolvedValue(metricsReport);
    renderMetrics();

    expect(
      await screen.findByRole('heading', { name: 'com_metrics_title', level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'com_metrics_registered_agents' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'com_metrics_cumulative_runs' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'com_metrics_forks' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'com_metrics_estimated_saved_hours' }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .slice(0, 4)
        .map((heading) => heading.nextElementSibling?.textContent),
    ).toEqual(['5', '89,234', '14', '38h']);
    expect(
      screen.getByText('com_metrics_base_and_staff_agents:base=3,staff=2'),
    ).toBeInTheDocument();
    expect(screen.getByText('com_metrics_staff_agent_runs:value=5,467')).toBeInTheDocument();
    expect(screen.getByText('com_metrics_forked_agents:value=4')).toBeInTheDocument();
    expect(screen.getByText('com_metrics_staff_agent_saved_hours:hours=12')).toBeInTheDocument();
    expect(screen.getByText('com_metrics_base_total:value=3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '주간보고 요약' })).toHaveAttribute(
      'href',
      '/skills/skill-1',
    );
    expect(screen.getByText('–')).toBeInTheDocument();
    expect(screen.getByText('com_metrics_staff_agent_ranking_note')).toBeInTheDocument();
    expect(screen.getByText('com_metrics_staff_contributor_note')).toBeInTheDocument();
  });

  it('uses the compact layout for metrics and rankings', async () => {
    getMetrics.mockResolvedValue(metricsReport);
    renderMetrics();

    const pageTitle = await screen.findByRole('heading', { name: 'com_metrics_title', level: 1 });

    expect(pageTitle.closest('div.mx-auto')).toHaveClass('pt-4', 'pb-8', 'px-6');
    expect(screen.getByText('com_ui_admin')).toBeInTheDocument();
    const registeredAgentsHeading = screen.getByRole('heading', {
      name: 'com_metrics_registered_agents',
    });
    expect(registeredAgentsHeading.nextElementSibling).toHaveClass('text-accent-primary');
    expect(registeredAgentsHeading).toHaveClass('text-[12.5px]', 'font-normal', 'text-text-muted');
    expect(registeredAgentsHeading.nextElementSibling?.nextElementSibling).toHaveClass(
      'text-text-muted',
    );
    ['com_metrics_agent_ranking', 'com_metrics_contributor_ranking'].forEach((name) =>
      expect(screen.getByRole('heading', { name })).toHaveClass('text-[15.5px]', 'font-bold'),
    );
    expect(registeredAgentsHeading.closest('section')).toHaveClass(
      'px-3.5',
      'py-3',
      'min-h-[111px]',
      'rounded-2xl',
      'shadow-[0_1px_2px_rgba(35,20,80,0.06)]',
    );
    expect(registeredAgentsHeading.closest('section')?.parentElement).toHaveClass('mb-[18px]');
    expect(registeredAgentsHeading.nextElementSibling).toHaveClass('mt-0.5', 'text-[22px]');
    expect(registeredAgentsHeading.nextElementSibling?.nextElementSibling).toHaveClass('text-xs');

    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(2);
    tables.forEach((table) => {
      expect(table).toHaveClass('text-[13px]');
      expect(table.querySelector('thead tr')).toHaveClass(
        'bg-surface-primary',
        'text-[11.5px]',
        'text-text-muted',
        'leading-[17px]',
      );
      expect(table.parentElement?.classList.contains('rounded-lg')).toBe(false);
      expect(table.parentElement?.classList.contains('border-border-light')).toBe(false);
    });

    const firstAgentRow = screen.getByRole('row', { name: /주간보고 요약/ });
    expect(screen.getByRole('link', { name: '주간보고 요약' })).toHaveClass('font-normal');
    const baseTotalLabel = screen.getByText('com_metrics_base_total:value=3');
    expect(baseTotalLabel.closest('tr')).toHaveClass('text-text-muted');
    expect(baseTotalLabel.closest('tr')).not.toHaveClass('bg-surface-secondary');
    const [agentTable, contributorTable] = tables;
    expect(within(agentTable).getByRole('cell', { name: '김민서 · 정세분석팀' })).toHaveClass(
      'text-text-muted',
    );
    const contributorName = within(contributorTable).getByRole('cell', {
      name: '김민서 · 정세분석팀',
    });
    expect(contributorName.closest('tr')).toHaveClass('text-text-primary');
    expect(contributorName).not.toHaveClass('text-text-tertiary', 'text-text-muted');
    const runsCell = within(firstAgentRow).getByRole('cell', { name: '5,422' });
    expect(runsCell).toHaveClass('px-2', 'py-[7.5px]', 'align-middle');
    tables.forEach((table) =>
      Array.from(table.querySelectorAll('tbody td')).forEach((cell) =>
        expect(cell).toHaveClass('py-[7.5px]'),
      ),
    );
    const runBar = runsCell.querySelector('span[aria-hidden="true"]');
    expect(runBar).toHaveStyle({ width: '90px' });
    expect(runBar?.classList.contains('bg-gradient-to-br')).toBe(true);
    expect(runBar?.classList.contains('from-[#8b5cf6]')).toBe(true);
    expect(runBar?.classList.contains('to-[#db2777]')).toBe(true);
  });

  it('navigates to the selected skill detail when another cell in its row is clicked', async () => {
    getMetrics.mockResolvedValue(metricsReport);
    const { router } = renderMetrics();
    const user = userEvent.setup();
    const row = await screen.findByRole('row', { name: /주간보고 요약/ });

    await user.click(within(row).getByText('5,422'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/skills/skill-1'));
  });

  it('shows a loading status while metrics are being fetched', () => {
    getMetrics.mockImplementation(() => new Promise<TSkillMetricsReport>(() => undefined));
    renderMetrics();

    expect(screen.getByRole('status')).toHaveTextContent('com_ui_loading');
  });

  it('renders the empty contributor state and the base total when no staff agents exist', async () => {
    getMetrics.mockResolvedValue({
      ...metricsReport,
      ranking: [],
      contributors: [],
    });
    renderMetrics();

    expect(await screen.findByText('com_metrics_empty_contributors')).toBeInTheDocument();
    const baseTotalRow = screen.getByRole('row', { name: /com_metrics_base_total/ });
    expect(baseTotalRow).toHaveClass('border-b', 'border-border-light');
    const emptyContributorRow = screen.getByRole('row', {
      name: /com_metrics_empty_contributors/,
    });
    expect(within(emptyContributorRow).getByRole('cell')).toHaveClass(
      'border-b',
      'border-border-light',
      'px-2',
      'py-[7.5px]',
    );
  });

  it('shows an error and retries the interrupted request', async () => {
    getMetrics.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(metricsReport);
    renderMetrics();

    expect(await screen.findByRole('alert')).toHaveTextContent('com_metrics_load_error');
    await userEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));

    expect(
      await screen.findByRole('heading', { name: 'com_metrics_title', level: 1 }),
    ).toBeInTheDocument();
    expect(getMetrics).toHaveBeenCalledTimes(2);
  });
});
