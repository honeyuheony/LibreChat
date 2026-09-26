import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import type { TMessage, TaskProgressEvent } from 'librechat-data-provider';
import type { TaskStepView, TaskToolCallState } from './taskState';
import type { TranslationKeys } from '~/hooks';
import { findLatestTaskToolCall, isAwaitingTaskApproval, resolveTaskSteps } from './taskState';
import { taskDecisionByToolCallId, taskProgressByToolCallId } from '~/store/task';
import { useActiveJobStatus, useGetMessagesByConvoId } from '~/data-provider';
import store from '~/store';

export type TaskRunStatus = 'wait' | 'run' | 'ok' | 'stopped';

export const TASK_STATUS_LABEL: Record<TaskRunStatus, TranslationKeys> = {
  wait: 'com_ui_convo_awaiting_approval',
  run: 'com_ui_task_status_running',
  ok: 'com_ui_task_status_done',
  stopped: 'com_ui_task_status_stopped',
};

export const TASK_STATUS_DOT: Record<TaskRunStatus, string> = {
  wait: 'bg-status-error-strong',
  run: 'bg-status-warning-strong',
  ok: 'bg-status-success',
  stopped: 'bg-border-heavy',
};

const selectMessages = (messages: TMessage[]) => messages;

/** The latest task call of a conversation, where its plan stands, and the run's status. */
export default function useTaskRunState(conversationId: string): {
  call: TaskToolCallState | null;
  progress: TaskProgressEvent | null;
  steps: TaskStepView[];
  awaiting: boolean;
  status: TaskRunStatus;
} {
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));
  const jobStatus = useActiveJobStatus(conversationId);
  const { data: messages } = useGetMessagesByConvoId(conversationId, {
    enabled: false,
    select: selectMessages,
  });

  const call = useMemo(() => findLatestTaskToolCall(messages), [messages]);
  const progress = useAtomValue(taskProgressByToolCallId(call?.toolCallId ?? ''));
  const decision = useAtomValue(taskDecisionByToolCallId(call?.toolCallId ?? ''));
  /** A cancel the server took stops the plan at the confirmation, as on the card. */
  const steps = useMemo(
    () =>
      call
        ? resolveTaskSteps(decision === 'reject' ? { ...call, hadApproval: true } : call, progress)
        : [],
    [call, decision, progress],
  );
  const awaiting = call != null && isAwaitingTaskApproval(call, progress, decision != null);

  let status: TaskRunStatus = 'ok';
  /** A live task call says itself whether it waits; the polled job list can still
   *  report the pause for a few seconds after the run went on. */
  if (awaiting || (jobStatus === 'requires_action' && (call == null || call.finished))) {
    status = 'wait';
  } else if (jobStatus != null || isSubmitting) {
    status = 'run';
  } else if (call?.finished === true && !call.hasResult) {
    status = 'stopped';
  }

  return { call, progress, steps, awaiting, status };
}
