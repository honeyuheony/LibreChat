import { useCallback, useEffect } from 'react';
import { useSetAtom } from 'jotai';
import type { Agents } from 'librechat-data-provider';
import { useApprovalContext, useResumeSubmit } from '../ApprovalContext';
import { taskDecisionByToolCallId } from '~/store/task';

/** 변경이 없으면 approve, 수정했으면 edit로 보내고 정책이 허용하지 않으면 null을 반환한다. */
export function runResolution(
  toolCallId: string,
  allowed: Agents.ToolApprovalDecisionType[],
  editedArguments: Record<string, unknown>,
  changed: boolean,
): Agents.ToolApprovalResolution | null {
  if (!changed && allowed.includes('approve')) {
    return { tool_call_id: toolCallId, decision: 'approve' };
  }
  if (allowed.includes('edit')) {
    return { tool_call_id: toolCallId, decision: 'edit', editedArguments };
  }
  return null;
}

/** 같은 호출을 표시하는 composer의 ToolApproval에도 선택을 보여 주려고 초안과 승인 batch를 갱신한다. */
export default function useTaskApproval(
  approval: NonNullable<Agents.ToolCall['approval']>,
  toolCallId: string,
) {
  const { actionId, allowed_decisions: allowed } = approval;
  const {
    registerToolCall,
    unregisterToolCall,
    setDecision,
    setDecisionDraft,
    getDecision,
    getDecisions,
    getRegisteredCount,
    getStatus,
  } = useApprovalContext();
  const { submitToolApproval } = useResumeSubmit();

  useEffect(() => {
    registerToolCall(actionId, toolCallId);
    return () => unregisterToolCall(actionId, toolCallId);
  }, [registerToolCall, unregisterToolCall, actionId, toolCallId]);

  const status = getStatus(actionId);
  const locked = status === 'submitting' || status === 'submitted' || status === 'expired';
  const decision = getDecision(actionId, toolCallId)?.decision;
  const setSentDecision = useSetAtom(taskDecisionByToolCallId(toolCallId));

  /** task panel이 이 호출을 승인 대기로 다시 표시하지 않도록 전송한 결정을 기록한다. */
  useEffect(() => {
    if (status === 'submitted' && decision != null) {
      setSentDecision(decision);
    }
  }, [status, decision, setSentDecision]);
  /** 서버는 batch 전체를 제출하므로 다른 호출도 모두 결정해야 이 선택을 보낼 수 있다. */
  const decidedIds = new Set(getDecisions(actionId).map((item) => item.tool_call_id));
  const othersPending = Math.max(
    0,
    getRegisteredCount(actionId) - decidedIds.size - (decidedIds.has(toolCallId) ? 0 : 1),
  );

  const decide = useCallback(
    (resolution: Agents.ToolApprovalResolution) => {
      setDecisionDraft(actionId, toolCallId, {
        active: resolution.decision,
        editText:
          resolution.editedArguments == null
            ? ''
            : JSON.stringify(resolution.editedArguments, null, 2),
        responseText: '',
        reason: '',
      });
      setDecision(actionId, toolCallId, resolution);
      submitToolApproval(actionId);
    },
    [actionId, toolCallId, setDecision, setDecisionDraft, submitToolApproval],
  );

  const reject = useCallback(
    () => decide({ tool_call_id: toolCallId, decision: 'reject' }),
    [decide, toolCallId],
  );

  const resolveRun = useCallback(
    (editedArguments: Record<string, unknown>, changed: boolean) =>
      runResolution(toolCallId, allowed, editedArguments, changed),
    [allowed, toolCallId],
  );

  return {
    status,
    locked,
    /** 거절 기록을 남겨 전송 뒤 상태를 「실행됨」이 아닌 「취소됨」으로 표시한다. */
    decision,
    othersPending,
    canEdit: allowed.includes('edit'),
    canReject: allowed.includes('reject'),
    resolveRun,
    decide,
    reject,
  };
}
