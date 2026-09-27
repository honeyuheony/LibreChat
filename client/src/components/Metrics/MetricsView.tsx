import { useTranslation } from 'react-i18next';
import { Button, Spinner } from '@librechat/client';
import { Link, useNavigate } from 'react-router-dom';
import type {
  TSkillMetricsAgent,
  TSkillMetricsContributor,
  TSkillMetricsReport,
} from 'librechat-data-provider';
import { useAdminSkillMetricsQuery } from '~/data-provider/Admin';
import { useLocalize } from '~/hooks';

type Localize = ReturnType<typeof useLocalize>;
type MetricTranslationKey =
  | 'com_metrics_title'
  | 'com_metrics_formula'
  | 'com_metrics_load_error'
  | 'com_metrics_agent_ranking'
  | 'com_metrics_staff_agent_ranking_note'
  | 'com_metrics_agent_name'
  | 'com_metrics_author'
  | 'com_metrics_runs'
  | 'com_metrics_forks'
  | 'com_metrics_saved_hours'
  | 'com_metrics_base_total'
  | 'com_metrics_contributor_ranking'
  | 'com_metrics_staff_contributor_note'
  | 'com_metrics_registration_count'
  | 'com_metrics_my_agent_runs'
  | 'com_metrics_fork_count'
  | 'com_metrics_empty_contributors'
  | 'com_metrics_registered_agents'
  | 'com_metrics_base_and_staff_agents'
  | 'com_metrics_cumulative_runs'
  | 'com_metrics_staff_agent_runs'
  | 'com_metrics_forked_agents'
  | 'com_metrics_estimated_saved_hours'
  | 'com_metrics_staff_agent_saved_hours';
type MetricsLocalize = (
  key: Parameters<Localize>[0] | MetricTranslationKey,
  options?: Parameters<Localize>[1],
) => ReturnType<Localize>;

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
    <section className="min-w-0 rounded-lg border border-border-light bg-surface-primary p-4 dark:border-chart-widget-stroke dark:bg-chart-widget-surface">
      <h2 className="text-sm font-semibold text-text-secondary">{label}</h2>
      <p className="mt-2 text-3xl font-semibold text-accent-primary">{value}</p>
      <p className="mt-1 text-sm text-text-tertiary">{detail}</p>
    </section>
  );
}

function PageHeader({ localize }: { localize: MetricsLocalize }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-bold text-text-primary">{localize('com_metrics_title')}</h1>
      <p className="mt-2 text-sm text-text-tertiary">{localize('com_metrics_formula')}</p>
    </header>
  );
}

function MetricsTopBar({ localize }: { localize: MetricsLocalize }) {
  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border-light bg-presentation/70 px-4 text-[14.5px] text-text-secondary backdrop-blur-md">
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
  localize: MetricsLocalize;
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
  localize: MetricsLocalize;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const maxRuns = report.ranking.reduce((maximum, agent) => Math.max(maximum, agent.runs), 1);
  const openSkill = (agent: TSkillMetricsAgent) => skillPath(agent.id);

  return (
    <section aria-labelledby="metrics-agent-ranking" className="mb-6">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h2 id="metrics-agent-ranking" className="text-lg font-semibold text-text-primary">
          {localize('com_metrics_agent_ranking')}
        </h2>
        <p className="text-sm text-text-tertiary">
          {localize('com_metrics_staff_agent_ranking_note')}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border-light text-left text-xs text-text-secondary">
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
                  <td className="px-2 py-1.5">
                    <Link
                      to={path}
                      className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
                    >
                      {title}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-text-tertiary">
                    {agent.authorDepartment
                      ? `${agent.authorName} · ${agent.authorDepartment}`
                      : agent.authorName || '–'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    <span
                      aria-hidden="true"
                      className="me-1.5 inline-block h-1.5 rounded-sm bg-gradient-to-r from-accent-primary to-accent-primary-hover align-middle"
                      style={{ width: `${Math.round((90 * agent.runs) / maxRuns)}px` }}
                    />
                    {formatNumber(agent.runs, locale)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatNumber(agent.forks, locale)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatHours(agent.savedHours, locale)}
                  </td>
                </tr>
              );
            })}
            <tr className="border-b border-border-light text-text-secondary">
              <td className="px-2 py-1.5">
                {localize('com_metrics_base_total', {
                  value: formatNumber(report.baseTotal.count, locale),
                })}
              </td>
              <td className="px-2 py-1.5">{report.baseTotal.authorName || '–'}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatNumber(report.baseTotal.runs, locale)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {formatNumber(report.baseTotal.forks, locale)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
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
  localize: MetricsLocalize;
}) {
  return (
    <section aria-labelledby="metrics-contributor-ranking">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h2 id="metrics-contributor-ranking" className="text-lg font-semibold text-text-primary">
          {localize('com_metrics_contributor_ranking')}
        </h2>
        <p className="text-sm text-text-tertiary">
          {localize('com_metrics_staff_contributor_note')}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border-light text-left text-xs text-text-secondary">
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
                  className="border-b border-border-light px-2 py-1.5 text-center text-text-tertiary"
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
                  <td className="px-2 py-1.5 text-text-tertiary">
                    {contributor.department
                      ? `${contributor.authorName} · ${contributor.department}`
                      : contributor.authorName || '–'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatNumber(contributor.agents, locale)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatNumber(contributor.runs, locale)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatNumber(contributor.forks, locale)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
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
  const localize = useLocalize() as MetricsLocalize;
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const metricsQuery = useAdminSkillMetricsQuery();
  const { data, isError, isFetching, isLoading, refetch } = metricsQuery;

  if (!data) {
    return (
      <main className="h-full w-full overflow-y-auto bg-presentation">
        <MetricsTopBar localize={localize} />
        <div className="mx-auto w-full max-w-[960px] px-4 py-8">
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
      <div className="mx-auto w-full max-w-[960px] px-4 py-8">
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
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
