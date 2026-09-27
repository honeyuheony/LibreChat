import { useContext, useMemo, useRef, useState } from 'react';
import { v4 } from 'uuid';
import { useSetAtom } from 'jotai';
import copy from 'copy-to-clipboard';
import { useSetRecoilState } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import { Button, useToastContext } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TCreateSchedule, TMessage, TaskTableResult } from 'librechat-data-provider';
import type { TaskResultAttachment } from './api';
import {
  downloadTaskReportFile,
  downloadTaskResultWorkbook,
  taskResultQuery,
  useTaskResultQuery,
} from '~/data-provider/Tasks/queries';
import {
  createScheduleCadence,
  DEFAULT_SCHEDULE_CADENCE,
  SCHEDULE_TIMEZONE,
} from '~/components/Schedules/cadence';
import { useAuthContext, useHasAccess, useLocalize, useSubmitMessage } from '~/hooks';
import { useCreateScheduleMutation } from '~/data-provider/Schedules';
import { taskDocToMarkdown } from '~/components/Task/TaskDocView';
import { useListSkillsQuery } from '~/data-provider/Skills';
import { useGetStartupConfig } from '~/data-provider';
import { ChatContext } from '~/Providers/ChatContext';
import { taskPanelState } from '~/store/task';
import { cn } from '~/utils';
import store from '~/store';

type Localize = ReturnType<typeof useLocalize>;

function topValueCounts(result: TaskTableResult, localize: Localize): string[] {
  return result.fields.map((field, column) => {
    const counts = new Map<string, number>();
    for (const row of result.rows) {
      const value = row.cells[column]?.value ?? null;
      const key = value == null ? localize('com_ui_task_value_none') : value;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return `${field}: ${top
      .map(([value, count]) => `${value} ${localize('com_ui_task_count', { 0: count })}`)
      .join(', ')}`;
  });
}

/** 결과 저장 시각 이전의 마지막 사용자 메시지를 결과가 답한 요청으로 연결한다. */
export function requestForResult(
  messages: TMessage[],
  resultCreatedAt: string,
): TMessage | undefined {
  const resultTimestamp = Date.parse(resultCreatedAt);
  if (!Number.isFinite(resultTimestamp)) {
    return undefined;
  }

  let latestUserMessage: TMessage | undefined;
  let latestUserTimestamp = Number.NEGATIVE_INFINITY;
  for (const message of messages) {
    if (!message.isCreatedByUser) {
      continue;
    }
    const messageTimestamp = Date.parse(message.createdAt ?? '');
    if (
      !Number.isFinite(messageTimestamp) ||
      messageTimestamp > resultTimestamp ||
      messageTimestamp < latestUserTimestamp
    ) {
      continue;
    }
    latestUserMessage = message;
    latestUserTimestamp = messageTimestamp;
  }
  return latestUserMessage;
}

function manualSkillsForResult(messages: TMessage[], resultCreatedAt: string): string[] {
  return requestForResult(messages, resultCreatedAt)?.manualSkills ?? [];
}

function ActionButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-8 px-2.5 text-text-secondary"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </Button>
  );
}

function ReportFromTableButton() {
  const localize = useLocalize();
  const { submitMessage } = useSubmitMessage();
  return (
    <ActionButton
      label={localize('com_ui_task_to_report')}
      onClick={() => submitMessage({ text: localize('com_ui_task_to_report_prompt') })}
    />
  );
}

function HwpDownloadButton({ file }: { file: { file_id: string; filename: string } }) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const download = async () => {
    try {
      if (!user?.id) {
        throw new Error('not signed in');
      }
      await downloadTaskReportFile(user.id, file);
    } catch {
      showToast({ status: 'error', message: localize('com_ui_task_download_error') });
    }
  };
  return <ActionButton label={localize('com_ui_task_hwp_download')} onClick={download} />;
}

/** 라이브 결과는 task panel이 자동으로 열고, 이 카드는 눌렀을 때만 연다. */
export default function TaskResultCard({ result }: { result: TaskResultAttachment }) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const chatContext = useContext(ChatContext);
  const conversation = chatContext?.conversation;
  const inChat = chatContext != null;
  const { data: startupConfig } = useGetStartupConfig();
  const canCreateSchedules = useHasAccess({
    permissionType: PermissionTypes.SCHEDULES,
    permission: Permissions.CREATE,
  });
  const schedulesConfig = startupConfig?.interface?.schedules;
  const schedulesEnabled =
    schedulesConfig != null &&
    schedulesConfig !== false &&
    !(typeof schedulesConfig === 'object' && schedulesConfig.use === false);
  const canSchedule =
    inChat && canCreateSchedules && schedulesEnabled && (conversation?.agent_id ?? '') !== '';
  const { data: listedSkills } = useListSkillsQuery({ limit: 100 }, { enabled: canSchedule });
  const createSchedule = useCreateScheduleMutation();
  const scheduleRequestId = useRef(v4());
  const [isPreparingSchedule, setIsPreparingSchedule] = useState(false);
  const setTaskPanel = useSetAtom(taskPanelState);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);
  const { resultId, kind, stats } = result;

  const resultQuery = useTaskResultQuery(kind === 'table' ? resultId : null);
  const valueCounts = useMemo(
    () => (resultQuery.data?.kind === 'table' ? topValueCounts(resultQuery.data, localize) : []),
    [resultQuery.data, localize],
  );

  const openResult = () => {
    setArtifactsVisible(false);
    setTaskPanel({ open: true, view: 'result', resultId });
  };

  const copyResult = async () => {
    try {
      const doc = await queryClient.fetchQuery(taskResultQuery(resultId));
      if (doc.kind === 'table' || !copy(taskDocToMarkdown(doc), { format: 'text/plain' })) {
        throw new Error('copy failed');
      }
      showToast({ status: 'success', message: localize('com_ui_task_copied') });
    } catch {
      showToast({ status: 'error', message: localize('com_ui_task_copy_error') });
    }
  };

  const downloadExcel = async () => {
    try {
      await downloadTaskResultWorkbook(resultId, `${result.title}.xlsx`);
    } catch {
      showToast({ status: 'error', message: localize('com_ui_task_excel_error') });
    }
  };

  const createWeeklySchedule = async () => {
    if (!canSchedule || conversation?.agent_id == null || isPreparingSchedule) {
      return;
    }
    setIsPreparingSchedule(true);
    try {
      const taskResult = await queryClient.fetchQuery(taskResultQuery(resultId));
      if (taskResult.conversationId !== conversation.conversationId) {
        throw new Error('Result conversation does not match current conversation');
      }
      const manualSkills = manualSkillsForResult(
        chatContext?.getMessages?.() ?? [],
        taskResult.createdAt,
      );
      const firstSkillName = manualSkills[0];
      const firstSkill = listedSkills?.skills.find((skill) => skill.name === firstSkillName);
      const scheduleName =
        firstSkill?.displayTitle || firstSkill?.name || firstSkillName || result.title;
      const payload: TCreateSchedule = {
        name: scheduleName,
        prompt: `${scheduleName}을 실행해 주세요.`,
        agent_id: conversation.agent_id,
        cadence: createScheduleCadence(DEFAULT_SCHEDULE_CADENCE),
        timezone: SCHEDULE_TIMEZONE,
        target: 'new',
        enabled: true,
        clientRequestId: scheduleRequestId.current,
        ...(manualSkills.length > 0 ? { skills: manualSkills } : {}),
        ...(conversation.file_ids != null ? { file_ids: conversation.file_ids } : {}),
        ...(conversation.chatProjectId ? { chatProjectId: conversation.chatProjectId } : {}),
      };
      createSchedule.mutate(payload, {
        onSuccess: () => {
          scheduleRequestId.current = v4();
          setIsPreparingSchedule(false);
          showToast({
            status: 'success',
            message: localize('com_ui_schedules_weekly_created'),
          });
        },
        onError: () => {
          setIsPreparingSchedule(false);
          showToast({ status: 'error', message: localize('com_ui_error') });
        },
      });
    } catch {
      setIsPreparingSchedule(false);
      showToast({ status: 'error', message: localize('com_ui_error') });
    }
  };

  const complete = stats.reflected === stats.docs;
  const allCached = stats.docs > 0 && stats.cached === stats.docs;
  const scope = [
    localize('com_ui_task_scope', { 0: stats.docs, 1: stats.reflected, 2: stats.seconds }),
    allCached ? localize('com_ui_task_scope_cached') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const textOnly =
    stats.textOnly > 0 ? ` ${localize('com_ui_task_result_text_only', { 0: stats.textOnly })}` : '';

  let message = '';
  let note = '';
  if (kind === 'table') {
    message = localize('com_ui_task_result_table');
    note = localize('com_ui_task_result_table_note', { 0: stats.none, 1: stats.low }) + textOnly;
  } else if (kind === 'summary') {
    message = localize('com_ui_task_result_summary');
  } else if (result.file != null) {
    message = localize('com_ui_task_result_report');
    note = localize('com_ui_task_result_report_note', { 0: stats.none }) + textOnly;
  } else {
    /** 서버가 파일 생성 실패 이유를 보내면 표시하고, 이전 결과에는 기본 안내를 쓴다. */
    message = result.notice?.trim() || localize('com_ui_task_result_report_no_file');
    note = localize('com_ui_task_result_report_note', { 0: stats.none }) + textOnly;
  }

  return (
    <div className="mt-3 flex flex-col" data-testid="task-result-card" data-kind={kind}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[0.8125rem] text-text-secondary">
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            complete ? 'bg-status-success-strong' : 'bg-status-warning-strong',
          )}
        />
        <span data-testid="task-result-scope">{scope}</span>
      </div>
      <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-text-primary">
        {message}
      </p>
      {valueCounts.length > 0 && (
        <ul className="mt-1 list-none text-[0.9375rem] leading-relaxed text-text-primary">
          {valueCounts.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {note && <p className="mt-1 text-[0.8125rem] text-text-secondary">{note}</p>}
      <div className="mt-1.5 flex flex-wrap gap-0.5">
        {kind === 'table' && (
          <>
            <ActionButton label={localize('com_ui_task_open_table')} onClick={openResult} />
            <ActionButton label={localize('com_ui_task_excel')} onClick={downloadExcel} />
            {inChat && <ReportFromTableButton />}
          </>
        )}
        {kind === 'summary' && (
          <>
            <ActionButton label={localize('com_ui_task_open_summary')} onClick={openResult} />
            <ActionButton label={localize('com_ui_task_copy')} onClick={copyResult} />
          </>
        )}
        {kind === 'report' && (
          <>
            <ActionButton label={localize('com_ui_task_open')} onClick={openResult} />
            {result.file != null && <HwpDownloadButton file={result.file} />}
          </>
        )}
        {canSchedule && (
          <ActionButton
            label={localize('com_ui_task_schedule_weekly')}
            onClick={createWeeklySchedule}
            disabled={isPreparingSchedule || createSchedule.isLoading}
          />
        )}
      </div>
    </div>
  );
}
