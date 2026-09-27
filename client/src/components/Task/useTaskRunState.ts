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

/** 대화의 마지막 작업 호출, 그 계획이 선 단계, 실행 상태. */
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
  /** 서버가 받아들인 취소는 카드와 같이 계획을 확인 단계에서 멈춘다. */
  const steps = useMemo(
    () =>
      call
        ? resolveTaskSteps(decision === 'reject' ? { ...call, hadApproval: true } : call, progress)
        : [],
    [call, decision, progress],
  );
  const awaiting = call != null && isAwaitingTaskApproval(call, progress, decision != null);

  let status: TaskRunStatus = 'ok';
  /** 살아 있는 호출은 기다리는지를 스스로 알려 준다. 주기적으로 읽는 작업 목록은 실행이
   *  이어진 뒤에도 몇 초 동안 멈춤으로 보고할 수 있다. */
  if (awaiting || (jobStatus === 'requires_action' && (call == null || call.finished))) {
    status = 'wait';
  } else if (jobStatus != null || isSubmitting) {
    status = 'run';
  } else if (call?.finished === true && !call.hasResult) {
    status = 'stopped';
  }

  return { call, progress, steps, awaiting, status };
}
