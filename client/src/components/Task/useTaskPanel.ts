import { useEffect, useMemo, useRef } from 'react';
import { useAtom } from 'jotai';
import { useSearchParams } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { collectTaskOutputs, findLatestTaskToolCall } from './taskState';
import { useGetMessagesByConvoId } from '~/data-provider';
import { taskPanelState } from '~/store/task';

const INITIAL_PANEL = { open: false, view: 'overview', resultId: null } as const;

export const RESULT_QUERY_PARAM = 'result';

const selectMessages = (messages: TMessage[]) => messages;

/**
 * Keeps the task panel in step with the conversation:
 * - entering or switching conversations closes it and drops any open result, except the
 *   new-chat → saved-id hop, which is the same conversation getting its id;
 * - the first task tool call in a conversation opens it (not on small screens,
 *   where the panel would cover the chat);
 * - a result that arrives while a reply is streaming opens that result (again not
 *   on small screens); results already there when the conversation's messages first
 *   loaded do not, even when a paused reply resumes as they load;
 * - `?result=<id>` (the library's links) opens that result once the messages show it
 *   belongs to this conversation, on every screen size, and only once per conversation.
 * This is the only place that opens the panel on its own; the result card in the
 * message opens it only when pressed.
 * Returns whether the panel should be offered for this conversation at all.
 */
export default function useTaskPanel(
  conversationId: string | null | undefined,
  { autoOpen, isSubmitting }: { autoOpen: boolean; isSubmitting: boolean },
): { hasTaskCall: boolean; open: boolean } {
  const [panel, setPanel] = useAtom(taskPanelState);
  const [searchParams] = useSearchParams();
  const requestedResultId = searchParams.get(RESULT_QUERY_PARAM);
  const { data: messages } = useGetMessagesByConvoId(conversationId ?? '', {
    enabled: false,
    select: selectMessages,
  });
  const hasTaskCall = useMemo(() => findLatestTaskToolCall(messages) != null, [messages]);
  const outputIds = useMemo(
    () => (messages == null ? null : collectTaskOutputs(messages).map((output) => output.resultId)),
    [messages],
  );

  const previousConversationRef = useRef<string | null | undefined>(undefined);
  const autoOpenedForRef = useRef<string | null>(null);
  /** Null until this conversation's messages have loaded once. */
  const seenOutputsRef = useRef<Set<string> | null>(null);
  const openedRequestedRef = useRef<string | null>(null);

  const current = conversationId ?? null;

  useEffect(() => {
    const previous = previousConversationRef.current;
    previousConversationRef.current = current;
    /** The first run resets too: the atom is app-wide and outlives this view. */
    if (previous === current || previous === Constants.NEW_CONVO) {
      return;
    }
    setPanel(INITIAL_PANEL);
    autoOpenedForRef.current = null;
    seenOutputsRef.current = null;
    openedRequestedRef.current = null;
  }, [current, setPanel]);

  useEffect(() => {
    if (!hasTaskCall || !autoOpen || autoOpenedForRef.current === current) {
      return;
    }
    autoOpenedForRef.current = current;
    setPanel((state) => ({ ...state, open: true }));
  }, [autoOpen, current, hasTaskCall, setPanel]);

  useEffect(() => {
    if (outputIds == null) {
      return;
    }
    if (seenOutputsRef.current == null) {
      seenOutputsRef.current = new Set(outputIds);
      return;
    }
    const seen = seenOutputsRef.current;
    const arrived = outputIds.filter((id) => !seen.has(id));
    arrived.forEach((id) => seen.add(id));
    if (arrived.length === 0 || !isSubmitting || !autoOpen) {
      return;
    }
    setPanel({ open: true, view: 'result', resultId: arrived[arrived.length - 1] });
  }, [autoOpen, isSubmitting, outputIds, setPanel]);

  /** Runs after the effects above so the requested result wins over their overview. */
  useEffect(() => {
    if (
      requestedResultId == null ||
      openedRequestedRef.current === requestedResultId ||
      !outputIds?.includes(requestedResultId)
    ) {
      return;
    }
    openedRequestedRef.current = requestedResultId;
    setPanel({ open: true, view: 'result', resultId: requestedResultId });
  }, [outputIds, requestedResultId, setPanel]);

  return { hasTaskCall, open: panel.open };
}
