import { SSE } from 'sse.js';
import { apiBaseUrl } from 'librechat-data-provider';
import type { TrialTransport } from './trial';
import { postGenerationRequest, generationProtocolHeaders } from '~/data-provider';

/** 대화 화면과 같은 생성 요청(`POST /api/agents/chat/:endpoint`)과 스트림 구독을 쓴다. */
export function createTrialTransport(token: string | undefined): TrialTransport {
  return {
    start: (url, payload) => postGenerationRequest<unknown>(url, payload),
    subscribe: (streamId, onMessage, onError) => {
      const sse = new SSE(
        `${apiBaseUrl()}/api/agents/chat/stream/${encodeURIComponent(streamId)}`,
        {
          headers: { Authorization: `Bearer ${token ?? ''}`, ...generationProtocolHeaders() },
          method: 'GET',
        },
      );
      sse.addEventListener('message', (event: MessageEvent) => {
        try {
          onMessage(JSON.parse(event.data as string));
        } catch (error) {
          onError(error);
        }
      });
      sse.addEventListener('error', onError);
      sse.stream();
      return () => sse.close();
    },
  };
}
