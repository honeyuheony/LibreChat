import { v4 } from 'uuid';
import { Constants, EndpointURLs, EModelEndpoint } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';

/** 시험 대화 한 턴을 여는 데 필요한 바깥 연결. 편집기는 실제 연결을, 테스트는 대역을 넘긴다. */
export type TrialTransport = {
  start: (url: string, payload: object) => Promise<unknown>;
  /** 스트림을 열고 받은 메시지마다 `onMessage` 를 부른다. 돌려준 함수로 닫는다. */
  subscribe: (
    streamId: string,
    onMessage: (data: unknown) => void,
    onError: (error: unknown) => void,
  ) => () => void;
};

export type TrialRequest = {
  skillName: string;
  prompt: string;
  spec: TModelSpec;
  onReply?: (reply: string) => void;
};

export type TrialOutcome = { conversationId: string; reply: string };

export class TrialError extends Error {
  constructor(readonly reason: 'start' | 'stream' | 'response') {
    super(`Test conversation failed at ${reason}`);
  }
}

type StartResponse = { streamId?: unknown; conversationId?: unknown };
type TextPart = { type?: unknown; text?: unknown };
type StreamMessage = {
  final?: unknown;
  error?: unknown;
  event?: unknown;
  data?: { delta?: { content?: TextPart[] } };
  conversation?: { conversationId?: unknown };
  responseMessage?: { error?: unknown; text?: unknown; content?: TextPart[] };
};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const joinText = (parts: TextPart[] | undefined): string =>
  (parts ?? [])
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');

/** 모델 고르기 화면이 꺼져 있으므로 기본 프리셋(`default`, 없으면 첫 항목)으로 시험한다. */
export function pickTrialSpec(list: TModelSpec[] | undefined): TModelSpec | null {
  if (!list || list.length === 0) {
    return null;
  }
  return list.find((spec) => spec.default === true) ?? list[0];
}

export function buildTrialPayload(request: TrialRequest) {
  const endpoint = request.spec.preset.endpoint ?? EModelEndpoint.agents;
  return {
    url: `${EndpointURLs[EModelEndpoint.agents]}/${encodeURIComponent(endpoint)}`,
    payload: {
      ...request.spec.preset,
      spec: request.spec.name,
      endpoint,
      text: request.prompt,
      sender: 'User',
      isCreatedByUser: true,
      messageId: v4(),
      parentMessageId: Constants.NO_PARENT,
      conversationId: null,
      isTemporary: true,
      manualSkills: [request.skillName],
      clientRequestId: v4(),
    },
  };
}

/** 임시 대화 한 턴을 끝까지 돌린다. 오류 없이 끝나면 대화 id 와 답을 돌려준다. */
export async function runTrial(
  transport: TrialTransport,
  request: TrialRequest,
): Promise<TrialOutcome> {
  const { url, payload } = buildTrialPayload(request);
  let started: StartResponse;
  try {
    started = ((await transport.start(url, payload)) ?? {}) as StartResponse;
  } catch {
    throw new TrialError('start');
  }
  const streamId = asString(started.streamId);
  if (!streamId) {
    throw new TrialError('start');
  }
  const startedConversationId = asString(started.conversationId) ?? streamId;

  return new Promise<TrialOutcome>((resolve, reject) => {
    let reply = '';
    let done = false;
    let close: (() => void) | null = null;
    const finish = (outcome: TrialOutcome | TrialError) => {
      if (done) {
        return;
      }
      done = true;
      close?.();
      if (outcome instanceof TrialError) {
        reject(outcome);
        return;
      }
      resolve(outcome);
    };
    close = transport.subscribe(
      streamId,
      (raw) => {
        const message = (raw ?? {}) as StreamMessage;
        if (message.error != null && message.error !== false) {
          finish(new TrialError('response'));
          return;
        }
        if (message.event === 'on_message_delta') {
          reply += joinText(message.data?.delta?.content);
          request.onReply?.(reply);
          return;
        }
        if (message.final == null) {
          return;
        }
        if (message.responseMessage?.error) {
          finish(new TrialError('response'));
          return;
        }
        const finalText =
          joinText(message.responseMessage?.content) ||
          asString(message.responseMessage?.text) ||
          reply;
        finish({
          conversationId: asString(message.conversation?.conversationId) ?? startedConversationId,
          reply: finalText,
        });
      },
      () => finish(new TrialError('stream')),
    );
    if (done) {
      close();
    }
  });
}
