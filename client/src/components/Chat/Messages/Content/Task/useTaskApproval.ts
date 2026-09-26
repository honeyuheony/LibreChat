import { useCallback, useEffect } from 'react';
import type { Agents } from 'librechat-data-provider';
import { useApprovalContext, useResumeSubmit } from '../ApprovalContext';

/**
 * Submits a task card's choice through the same approval batch as `ToolApproval`.
 * The decision draft is written too, so the composer review panel (which renders the
 * generic `ToolApproval` for the same call) shows and keeps the same decision.
 */
export default function useTaskApproval(actionId: string, toolCallId: string) {
  const { registerToolCall, unregisterToolCall, setDecision, setDecisionDraft, getStatus } =
    useApprovalContext();
  const { submitToolApproval } = useResumeSubmit();

  useEffect(() => {
    registerToolCall(actionId, toolCallId);
    return () => unregisterToolCall(actionId, toolCallId);
  }, [registerToolCall, unregisterToolCall, actionId, toolCallId]);

  const status = getStatus(actionId);
  const locked = status === 'submitting' || status === 'submitted' || status === 'expired';

  const submit = useCallback(
    (editedArguments: Record<string, unknown> | null) => {
      const resolution: Agents.ToolApprovalResolution =
        editedArguments == null
          ? { tool_call_id: toolCallId, decision: 'approve' }
          : { tool_call_id: toolCallId, decision: 'edit', editedArguments };
      setDecisionDraft(actionId, toolCallId, {
        active: resolution.decision,
        editText: editedArguments == null ? '' : JSON.stringify(editedArguments, null, 2),
        responseText: '',
        reason: '',
      });
      setDecision(actionId, toolCallId, resolution);
      submitToolApproval(actionId);
    },
    [actionId, toolCallId, setDecision, setDecisionDraft, submitToolApproval],
  );

  return { status, locked, submit };
}
