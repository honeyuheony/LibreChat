import React from 'react';
import { RecoilRoot } from 'recoil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as JotaiProvider, createStore } from 'jotai';
import type { MutableSnapshot } from 'recoil';
import ApprovalProvider from '~/components/Chat/Messages/Content/ApprovalContext';
import { ChatContext } from '~/Providers/ChatContext';
import store from '~/store';

export const CONVERSATION_ID = 'conversation-1';

export function createTaskWrapper({
  jotaiStore = createStore(),
  inChat = true,
}: { jotaiStore?: ReturnType<typeof createStore>; inChat?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });
  const chatContextValue = {
    conversation: { conversationId: CONVERSATION_ID, endpoint: 'agents', agent_id: 'agent-1' },
  } as unknown as React.ContextType<typeof ChatContext>;
  const initializeState = (snapshot: MutableSnapshot) => {
    snapshot.set(store.activeGenerationCreatedAtByConvoId(CONVERSATION_ID), 1000);
  };
  return function TaskWrapper({ children }: { children: React.ReactNode }) {
    const content = <ApprovalProvider>{children}</ApprovalProvider>;
    return (
      <RecoilRoot initializeState={initializeState}>
        <QueryClientProvider client={queryClient}>
          <JotaiProvider store={jotaiStore}>
            {inChat ? (
              <ChatContext.Provider value={chatContextValue}>{content}</ChatContext.Provider>
            ) : (
              content
            )}
          </JotaiProvider>
        </QueryClientProvider>
      </RecoilRoot>
    );
  };
}
