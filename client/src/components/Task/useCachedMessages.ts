import type { TMessage } from 'librechat-data-provider';
import { useGetMessagesByConvoId } from '~/data-provider';

const selectMessages = (messages: TMessage[]) => messages;

/** 대화 화면이 이미 받아 둔 메시지를 캐시에서만 읽는다. 따로 요청하지 않는다. */
export default function useCachedMessages(conversationId: string): TMessage[] | undefined {
  const { data } = useGetMessagesByConvoId(conversationId, {
    enabled: false,
    select: selectMessages,
  });
  return data;
}
