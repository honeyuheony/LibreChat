import { useTranslation } from 'react-i18next';
import { Button, Spinner } from '@librechat/client';
import { Link, useNavigate } from 'react-router-dom';
import type {
  TSkillMetricsAgent,
  TSkillMetricsContributor,
  TSkillMetricsReport,
} from 'librechat-data-provider';
import { useAdminSkillMetricsQuery } from '~/data-provider/Admin';
import { pageTopBarClassName } from '~/components/ui/topbar';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type Localize = ReturnType<typeof useLocalize>;
const numericCellClassName = 'px-2 py-[7.5px] text-right align-middle tabular-nums';

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
};

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

function formatHours(value: number | null, locale: string): string {
  if (value == null) {
    return '–';
  }
  return `${formatNumber(value, locale)}h`;
}

function skillPath(skillId: string): string {
  return `/skills/${encodeURIComponent(skillId)}`;
}

function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <section
      className={cn(
        'min-h-[111px] min-w-0 rounded-2xl border border-border-light bg-surface-primary px-3.5 py-3 shadow-[0_1px_2px_rgba(35,20,80,0.06)]',
        'dark:border-chart-widget-stroke dark:bg-chart-widget-surface dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)]',
      )}
    >
      <h2 className="text-[12.5px] font-normal text-text-muted">{label}</h2>
      <p className="mt-0.5 text-[22px] font-semibold text-accent-primary">{value}</p>
      <p className="text-xs text-text-muted">{detail}</p>
    </section>
  );
}

function PageHeader({ localize }: { localize: Localize }) {
  return (
    <header className="mb-5">
      <h1 className="text-[22px] font-bold text-text-primary">{localize('com_metrics_title')}</h1>
      <p className="mt-2 text-[13px] text-text-muted">{localize('com_metrics_formula')}</p>
    </header>
  );
}

function MetricsTopBar({ localize }: { localize: Localize }) {
  return (
    <header className={pageTopBarClassName}>
      <span className="font-semibold text-text-primary">{localize('com_metrics_title')}</span>
      <span className="text-text-tertiary">{localize('com_ui_admin')}</span>
    </header>
  );
}

function StatusPanel({
  localize,
  error,
  onRetry,
  isFetching = false,
}: {
  localize: Localize;
  error: boolean;
  onRetry?: () => void;
  isFetching?: boolean;
}) {
  if (error) {
    return (
      <section
        role="alert"
        className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-border-light bg-surface-primary p-5 text-center dark:border-chart-widget-stroke dark:bg-chart-widget-surface"
      >
        <p className="text-sm text-text-secondary">{localize('com_metrics_load_error')}</p>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={isFetching}>
            {localize('com_ui_retry')}
          </Button>
        )}
      </section>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-border-light bg-surface-primary p-5 dark:border-chart-widget-stroke dark:bg-chart-widget-surface"
    >
      <Spinner className="size-7 text-text-secondary" />
      <span className="text-sm text-text-secondary">{localize('com_ui_loading')}</span>
    </div>
  );
}

function AgentRanking({
  report,
  locale,
  localize,
  navigate,
}: {
  report: TSkillMetricsReport;
  locale: string;
  localize: Localize;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const maxRuns = report.ranking.reduce((maximum, agent) => Math.max(maximum, agent.runs), 1);
  const openSkill = (agent: TSkillMetricsAgent) => skillPath(agent.id);

  return (
    <section aria-labelledby="metrics-agent-ranking" className="mb-6">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h2 id="metrics-agent-ranking" className="text-[15.5px] font-bold text-text-primary">
          {localize('com_metrics_agent_ranking')}
        </h2>
        <p className="text-[13px] text-text-muted">
          {localize('com_metrics_staff_agent_ranking_note')}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border-light bg-surface-primary text-left text-[11.5px] leading-[17px] text-text-muted">
              <th scope="col" className="px-2 py-1.5 font-medium">
                {localize('com_metrics_agent_name')}
              </th>
              <th scope="col" className="px-2 py-1.5 font-medium">
                {localize('com_metrics_author')}
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                {localize('com_metrics_runs')}
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                {localize('com_metrics_forks')}
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                {localize('com_metrics_saved_hours')}
              </th>
            </tr>
          </thead>
          <tbody>
            {report.ranking.map((agent) => {
              const title = agent.displayTitle || agent.name;
              const path = openSkill(agent);
              return (
                <tr
                  key={agent.id}
                  onClick={(event) => {
                    if (event.target instanceof Element && event.target.closest('a')) {
                      return;
                    }
                    navigate(path);
                  }}
                  className="cursor-pointer border-b border-border-light text-text-primary hover:bg-surface-hover"
                >
                  <td className="px-2 py-[7.5px]">
                    <Link
                      to={path}
                      className="font-normal underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                    >
                      {title}
                    </Link>
                  </td>
                  <td className="px-2 py-[7.5px] text-text-muted">
                    {agent.authorDepartment
                      ? `${agent.authorName} · ${agent.authorDepartment}`
                      : agent.authorName || '–'}
                  </td>
                  <td className={numericCellClassName}>
                    <span
                      aria-hidden="true"
                      className="me-1.5 inline-block h-1.5 rounded-sm bg-gradient-to-br from-[#8b5cf6] to-[#db2777] align-middle"
                      style={{ width: `${Math.round((90 * agent.runs) / maxRuns)}px` }}
                    />
                    {formatNumber(agent.runs, locale)}
                  </td>
                  <td className={numericCellClassName}>{formatNumber(agent.forks, locale)}</td>
                  <td className={numericCellClassName}>{formatHours(agent.savedHours, locale)}</td>
                </tr>
              );
            })}
            <tr className="border-b border-border-light text-text-muted">
              <td className="px-2 py-[7.5px]">
                {localize('com_metrics_base_total', {
                  value: formatNumber(report.baseTotal.count, locale),
                })}
              </td>
              <td className="px-2 py-[7.5px]">{report.baseTotal.authorName || '–'}</td>
              <td className={numericCellClassName}>
                {formatNumber(report.baseTotal.runs, locale)}
              </td>
              <td className={numericCellClassName}>
                {formatNumber(report.baseTotal.forks, locale)}
              </td>
              <td className={numericCellClassName}>
                {formatHours(report.baseTotal.savedHours, locale)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ContributorRanking({
  contributors,
  locale,
  localize,
}: {
  contributors: TSkillMetricsContributor[];
  locale: string;
  localize: Localize;
}) {
  return (
    <section aria-labelledby="metrics-contributor-ranking">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h2 id="metrics-contributor-ranking" className="text-[15.5px] font-bold text-text-primary">
          {localize('com_metrics_contributor_ranking')}
        </h2>
        <p className="text-[13px] text-text-muted">
          {localize('com_metrics_staff_contributor_note')}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border-light bg-surface-primary text-left text-[11.5px] leading-[17px] text-text-muted">
              <th scope="col" className="px-2 py-1.5 font-medium">
                {localize('com_metrics_author')}
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                {localize('com_metrics_registration_count')}
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                {localize('com_metrics_my_agent_runs')}
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                {localize('com_metrics_fork_count')}
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                {localize('com_metrics_saved_hours')}
              </th>
            </tr>
          </thead>
          <tbody>
            {contributors.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="border-b border-border-light px-2 py-[7.5px] text-center text-text-tertiary"
                >
                  {localize('com_metrics_empty_contributors')}
                </td>
              </tr>
            ) : (
              contributors.map((contributor) => (
                <tr
                  key={`${contributor.authorName}-${contributor.department ?? ''}`}
                  className="border-b border-border-light text-text-primary"
                >
                  <td className="px-2 py-[7.5px]">
                    {contributor.department
                      ? `${contributor.authorName} · ${contributor.department}`
                      : contributor.authorName || '–'}
                  </td>
                  <td className={numericCellClassName}>
                    {formatNumber(contributor.agents, locale)}
                  </td>
                  <td className={numericCellClassName}>{formatNumber(contributor.runs, locale)}</td>
                  <td className={numericCellClassName}>
                    {formatNumber(contributor.forks, locale)}
                  </td>
                  <td className={numericCellClassName}>
                    {formatHours(contributor.savedHours, locale)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function MetricsView() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const metricsQuery = useAdminSkillMetricsQuery();
  const { data, isError, isFetching, isLoading, refetch } = metricsQuery;

  if (!data) {
    return (
      <main className="h-full w-full overflow-y-auto bg-presentation">
        <MetricsTopBar localize={localize} />
        <div className="mx-auto w-full max-w-[960px] px-6 pb-8 pt-4">
          <PageHeader localize={localize} />
          <StatusPanel
            localize={localize}
            error={isError || !isLoading}
            onRetry={isError ? () => void refetch() : undefined}
            isFetching={isFetching}
          />
        </div>
      </main>
    );
  }

  const number = (value: number) => formatNumber(value, locale);
  const cards: MetricCardProps[] = [
    {
      label: localize('com_metrics_registered_agents'),
      value: number(data.agents.total),
      detail: localize('com_metrics_base_and_staff_agents', {
        base: number(data.agents.base),
        staff: number(data.agents.staff),
      }),
    },
    {
      label: localize('com_metrics_cumulative_runs'),
      value: number(data.runs.total),
      detail: localize('com_metrics_staff_agent_runs', { value: number(data.runs.staff) }),
    },
    {
      label: localize('com_metrics_forks'),
      value: number(data.forks.total),
      detail: localize('com_metrics_forked_agents', { value: number(data.forks.forkedAgents) }),
    },
    {
      label: localize('com_metrics_estimated_saved_hours'),
      value: formatHours(data.savedHours.total, locale),
      detail: localize('com_metrics_staff_agent_saved_hours', {
        hours: number(data.savedHours.staff),
      }),
    },
  ];

  return (
    <main className="h-full w-full overflow-y-auto bg-presentation">
      <MetricsTopBar localize={localize} />
      <div className="mx-auto w-full max-w-[960px] px-6 pb-8 pt-4">
        <PageHeader localize={localize} />
        {isError && (
          <div className="mb-4">
            <StatusPanel
              localize={localize}
              error
              onRetry={() => void refetch()}
              isFetching={isFetching}
            />
          </div>
        )}
        <div className="mb-[18px] grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </div>
        <AgentRanking report={data} locale={locale} localize={localize} navigate={navigate} />
        <ContributorRanking contributors={data.contributors} locale={locale} localize={localize} />
      </div>
    </main>
  );
}
