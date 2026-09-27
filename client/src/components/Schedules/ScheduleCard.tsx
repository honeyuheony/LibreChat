import { useTranslation } from 'react-i18next';
import { Button, Switch, useToastContext } from '@librechat/client';
import type { TSchedule, ScheduleDisabledReason, ScheduleRunStatus } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import {
  useDeleteScheduleMutation,
  useRunScheduleNowMutation,
  useUpdateScheduleMutation,
} from '~/data-provider/Schedules';
import { formatScheduleCadence } from './cadence';
import { useLocalize } from '~/hooks';

const RUN_STATUS_KEYS: Record<ScheduleRunStatus, TranslationKeys> = {
  started: 'com_ui_schedule_run_started',
  requires_action: 'com_ui_schedules_status_approval',
  success: 'com_ui_schedules_status_success',
  error: 'com_ui_schedules_status_failed',
  interrupted: 'com_ui_schedules_status_failed',
  skipped_overlap: 'com_ui_schedule_run_skipped',
  skipped_balance: 'com_ui_schedule_run_skipped',
};

const DISABLED_REASON_KEYS: Record<ScheduleDisabledReason, TranslationKeys> = {
  mcp_reauth_required: 'com_ui_schedule_disabled_mcp_reauth',
  mcp_configuration_missing: 'com_ui_schedule_disabled_mcp_configuration',
  mcp_permission_denied: 'com_ui_schedule_disabled_mcp_permission',
  too_many_failures: 'com_ui_schedule_disabled_too_many_failures',
  agent_deleted: 'com_ui_schedule_disabled_agent_deleted',
  invalid_schedule: 'com_ui_schedule_disabled_invalid',
  permission_revoked: 'com_ui_schedule_disabled_permission_revoked',
  insufficient_balance: 'com_ui_schedule_disabled_insufficient_balance',
  project_deleted: 'com_ui_schedule_disabled_project_deleted',
  project_required: 'com_ui_schedule_disabled_project_required',
};

interface ScheduleCardProps {
  schedule: TSchedule;
  skillNames: ReadonlyMap<string, string>;
  projectName?: string;
  canWrite: boolean;
}

function formatLastRunTime(schedule: TSchedule, locale: string): string | undefined {
  const firedAt = schedule.lastRun?.firedAt;
  if (firedAt == null) {
    return undefined;
  }
  const date = new Date(firedAt);
  if (Number.isNaN(date.getTime())) {
    return firedAt;
  }
  return new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: schedule.timezone,
  }).format(date);
}

export default function ScheduleCard({
  schedule,
  skillNames,
  projectName,
  canWrite,
}: ScheduleCardProps) {
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const { showToast } = useToastContext();
  const agentKey = schedule.skills?.[0] ?? schedule.agent_id;
  const agentName = skillNames.get(agentKey) ?? agentKey;
  const conversationName = schedule.chatProjectId
    ? (projectName ?? schedule.chatProjectId)
    : localize('com_ui_schedules_new_chat');
  const cadence = formatScheduleCadence(schedule.cadence, localize, i18n.language);
  const lastRunTime = formatLastRunTime(schedule, i18n.language);
  const lastRunStatus = schedule.lastRun
    ? localize(RUN_STATUS_KEYS[schedule.lastRun.status])
    : undefined;
  const lastRun =
    lastRunTime != null && lastRunStatus != null
      ? localize('com_ui_schedules_last_run_line', {
          time: lastRunTime,
          status: lastRunStatus,
        })
      : localize('com_ui_schedules_last_run_none');
  const disabledReason = schedule.disabledReason
    ? localize(DISABLED_REASON_KEYS[schedule.disabledReason])
    : undefined;

  const updateSchedule = useUpdateScheduleMutation({
    onError: (error, variables) => {
      const status = (error as { response?: { status?: number } }).response?.status;
      showToast({
        status: 'error',
        message: localize(
          status === 400 && variables.payload.enabled === true
            ? 'com_ui_schedule_enable_blocked'
            : 'com_ui_error',
        ),
      });
    },
  });
  const deleteSchedule = useDeleteScheduleMutation({
    onSuccess: () => showToast({ status: 'success', message: localize('com_ui_deleted') }),
    onError: () => showToast({ status: 'error', message: localize('com_ui_error') }),
  });
  const runSchedule = useRunScheduleNowMutation({
    onSuccess: () =>
      showToast({ status: 'success', message: localize('com_ui_schedule_run_now_started') }),
    onError: () => showToast({ status: 'error', message: localize('com_ui_error') }),
  });

  return (
    <article
      data-testid="schedule-tile"
      className="rounded-xl border border-border-light bg-surface-primary p-4"
    >
      <div className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-text-primary">
          {schedule.name}
        </h2>
        {canWrite && (
          <Switch
            checked={schedule.enabled}
            onCheckedChange={(enabled) =>
              updateSchedule.mutate({ id: schedule.id, payload: { enabled } })
            }
            disabled={updateSchedule.isLoading}
            aria-label={`${localize('com_ui_schedule_enabled')}: ${schedule.name}`}
          />
        )}
      </div>
      <p className="mt-1 truncate text-sm text-text-secondary">
        {localize('com_ui_schedules_card_detail', {
          agent: `/${agentName}`,
          conversation: conversationName,
          cadence,
        })}
      </p>
      <p className="mt-1 text-sm text-text-secondary">{lastRun}</p>
      {disabledReason != null && (
        <p className="mt-1 text-sm text-status-error-strong">{disabledReason}</p>
      )}
      {canWrite && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => runSchedule.mutate(schedule.id)}
            disabled={runSchedule.isLoading || (schedule.inFlight?.length ?? 0) > 0}
          >
            {localize('com_ui_schedule_run_now')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => deleteSchedule.mutate(schedule.id)}
            disabled={deleteSchedule.isLoading}
          >
            {localize('com_ui_delete')}
          </Button>
        </div>
      )}
    </article>
  );
}
