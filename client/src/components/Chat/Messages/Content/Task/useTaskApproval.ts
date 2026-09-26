import { useCallback, useEffect } from 'react';
import type { Agents } from 'librechat-data-provider';
import { useApprovalContext, useResumeSubmit } from '../ApprovalContext';

/**
 * What 「실행」 sends under the server's `allowed_decisions`: an approve when the card
 * left the model's arguments as they were, otherwise an edit carrying the card's
 * arguments. Null when the policy allows neither, e.g. a changed pick with no `edit`.
 */
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

/**
 * Submits a task card's choice through the same approval batch as `ToolApproval`.
 * The decision draft is written too, so the composer review panel (which renders the
 * generic `ToolApproval` for the same call) shows and keeps the same decision.
 */
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
    /** The decision this card holds, so a sent reject reads 「취소됨」 rather than 「실행됨」. */
    decision,
    canEdit: allowed.includes('edit'),
    canReject: allowed.includes('reject'),
    resolveRun,
    decide,
    reject,
  };
}
