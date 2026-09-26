import { useEffect, useMemo, useRef } from 'react';
import { useAtom } from 'jotai';
import { Constants } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { collectTaskOutputs, findLatestTaskToolCall } from './taskState';
import { useGetMessagesByConvoId } from '~/data-provider';
import { taskPanelState } from '~/store/task';

const INITIAL_PANEL = { open: false, view: 'overview', resultId: null } as const;

const selectMessages = (messages: TMessage[]) => messages;

/**
 * Keeps the task panel in step with the conversation:
 * - entering or switching conversations closes it and drops any open result, except the
 *   new-chat → saved-id hop, which is the same conversation getting its id;
 * - the first task tool call in a conversation opens it (not on small screens,
 *   where the panel would cover the chat);
 * - a result that arrives while a reply is streaming opens that result; results
 *   that were already there when the conversation loaded do not.
 * Returns whether the panel should be offered for this conversation at all.
 */
export default function useTaskPanel(
  conversationId: string | null | undefined,
  { autoOpen, isSubmitting }: { autoOpen: boolean; isSubmitting: boolean },
): { hasTaskCall: boolean; open: boolean } {
  const [panel, setPanel] = useAtom(taskPanelState);
  const { data: messages } = useGetMessagesByConvoId(conversationId ?? '', {
    enabled: false,
    select: selectMessages,
  });
  const hasTaskCall = useMemo(() => findLatestTaskToolCall(messages) != null, [messages]);
  const outputIds = useMemo(
    () => collectTaskOutputs(messages).map((output) => output.resultId),
    [messages],
  );

  const previousConversationRef = useRef<string | null | undefined>(undefined);
  const autoOpenedForRef = useRef<string | null>(null);
  const seenOutputsRef = useRef(new Set<string>());

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
    seenOutputsRef.current = new Set();
  }, [current, setPanel]);

  useEffect(() => {
    if (!hasTaskCall || !autoOpen || autoOpenedForRef.current === current) {
      return;
    }
    autoOpenedForRef.current = current;
    setPanel((state) => ({ ...state, open: true }));
  }, [autoOpen, current, hasTaskCall, setPanel]);

  useEffect(() => {
    const seen = seenOutputsRef.current;
    const arrived = outputIds.filter((id) => !seen.has(id));
    arrived.forEach((id) => seen.add(id));
    if (arrived.length === 0 || !isSubmitting) {
      return;
    }
    setPanel({ open: true, view: 'result', resultId: arrived[arrived.length - 1] });
  }, [isSubmitting, outputIds, setPanel]);

  return { hasTaskCall, open: panel.open };
}
