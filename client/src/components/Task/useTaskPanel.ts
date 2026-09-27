import { useEffect, useMemo, useRef } from 'react';
import { useAtom } from 'jotai';
import { useSearchParams } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import { collectTaskOutputs, findLatestTaskToolCall } from './taskState';
import useCachedMessages from './useCachedMessages';
import { taskPanelState } from '~/store/task';

const INITIAL_PANEL = { open: false, view: 'overview', resultId: null } as const;

export const RESULT_QUERY_PARAM = 'result';

/**
 * 작업 패널을 대화에 맞춰 열고 닫는다.
 * - 대화에 들어가거나 바꾸면 닫고 열린 결과를 치운다. 새 대화가 저장되어 id 를 받는 이동은
 *   같은 대화이므로 예외다.
 * - 대화의 첫 작업 도구 호출이 패널을 연다. 패널이 대화를 가리는 작은 화면에서는 열지 않는다.
 * - 답이 오는 동안 도착한 결과는 그 결과 화면을 연다(작은 화면 제외). 메시지를 처음 불러올 때
 *   이미 있던 결과는, 멈췄던 답이 불러오는 사이 이어지더라도 열지 않는다.
 * - `?result=<id>`(자료실 링크)는 메시지에서 그 결과가 이 대화의 것임을 확인한 뒤 화면 크기와
 *   상관없이 대화마다 한 번 연다.
 * 패널을 스스로 여는 곳은 여기뿐이다. 메시지의 결과 카드는 눌렀을 때만 연다.
 * 이 대화에서 패널을 보여 줄지를 돌려준다.
 */
export default function useTaskPanel(
  conversationId: string | null | undefined,
  { autoOpen, isSubmitting }: { autoOpen: boolean; isSubmitting: boolean },
): { hasTaskCall: boolean; open: boolean } {
  const [panel, setPanel] = useAtom(taskPanelState);
  const [searchParams] = useSearchParams();
  const requestedResultId = searchParams.get(RESULT_QUERY_PARAM);
  const messages = useCachedMessages(conversationId ?? '');
  const hasTaskCall = useMemo(() => findLatestTaskToolCall(messages) != null, [messages]);
  const outputIds = useMemo(
    () => (messages == null ? null : collectTaskOutputs(messages).map((output) => output.resultId)),
    [messages],
  );

  const previousConversationRef = useRef<string | null | undefined>(undefined);
  const autoOpenedForRef = useRef<string | null>(null);
  /** 이 대화의 메시지를 한 번 불러오기 전에는 null 이다. */
  const seenOutputsRef = useRef<Set<string> | null>(null);
  const openedRequestedRef = useRef<string | null>(null);

  const current = conversationId ?? null;

  useEffect(() => {
    const previous = previousConversationRef.current;
    previousConversationRef.current = current;
    /** atom 은 앱 전체에서 살아 이 화면보다 오래 가므로 첫 실행에서도 초기화한다. */
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

  /** 위 effect 들이 개요로 돌려놓은 뒤에 돌아야 요청한 결과가 이긴다. */
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
