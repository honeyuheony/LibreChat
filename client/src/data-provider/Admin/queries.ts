import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type { TSkillMetricsReport } from 'librechat-data-provider';

export const useAdminSkillMetricsQuery = (
  config?: UseQueryOptions<TSkillMetricsReport>,
): QueryObserverResult<TSkillMetricsReport> =>
  useQuery<TSkillMetricsReport>(
    [QueryKeys.skills, 'admin-metrics'],
    () => dataService.getAdminSkillMetrics(),
    {
      refetchOnWindowFocus: false,
      retry: false,
      ...config,
    },
  );
