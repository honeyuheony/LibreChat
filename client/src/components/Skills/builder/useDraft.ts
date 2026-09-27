import { useEffect, useRef, useState } from 'react';
import type { TSkillDraft, TSkillDraftRequest } from 'librechat-data-provider';
import { firstSentence } from './state';

/** 입력창에서 손을 뗀 뒤 초안을 부르기까지 기다리는 시간. */
export const DRAFT_DEBOUNCE_MS = 1000;
/** 429 를 받은 뒤 초안 요청을 쉬는 시간. 서버 한도 창 길이에 맞춘 값은 아니다. */
export const DRAFT_RATE_LIMIT_PAUSE_MS = 30_000;

type UseDraftOptions = {
  text: string;
  direct: boolean;
  requestDraft: (payload: TSkillDraftRequest) => Promise<TSkillDraft>;
  onDraft: (draft: TSkillDraft) => void;
  isRateLimited: (error: unknown) => boolean;
};

/** 첫 문장이 바뀌었을 때만, 입력이 멈춘 뒤 한 번 초안을 부른다. 429 를 받으면 잠시 부르지 않는다. */
export default function useDraft({
  text,
  direct,
  requestDraft,
  onDraft,
  isRateLimited,
}: UseDraftOptions) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastRequested = useRef('');
  const pausedUntil = useRef(0);
  const sequence = useRef(0);
  const callbacks = useRef({ requestDraft, onDraft, isRateLimited });
  callbacks.current = { requestDraft, onDraft, isRateLimited };

  useEffect(() => {
    if (direct) {
      return;
    }
    const sentence = firstSentence(text);
    if (!sentence || sentence === lastRequested.current) {
      return;
    }
    const timer = setTimeout(() => {
      if (Date.now() < pausedUntil.current) {
        return;
      }
      lastRequested.current = sentence;
      const current = ++sequence.current;
      setPending(true);
      callbacks.current
        .requestDraft({ text, direct: false })
        .then((draft) => {
          if (current === sequence.current) {
            setFailed(false);
            callbacks.current.onDraft(draft);
          }
        })
        .catch((error: unknown) => {
          lastRequested.current = '';
          if (callbacks.current.isRateLimited(error)) {
            pausedUntil.current = Date.now() + DRAFT_RATE_LIMIT_PAUSE_MS;
          }
          if (current === sequence.current) {
            setFailed(true);
          }
        })
        .finally(() => {
          if (current === sequence.current) {
            setPending(false);
          }
        });
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, direct]);

  return { pending, failed };
}
