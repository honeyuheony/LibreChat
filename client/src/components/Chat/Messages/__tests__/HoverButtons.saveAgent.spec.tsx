/**
 * @jest-environment-options {"url": "http://localhost:9"}
 */
import React from 'react';
import { RecoilRoot } from 'recoil';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  Permissions,
  EModelEndpoint,
  PermissionTypes,
  type TConversation,
  type TMessage,
} from 'librechat-data-provider';
import type { TAuthContext } from '~/common';
import {
  MessagesViewContext,
  type MessagesViewContextValue,
} from '~/Providers/MessagesViewContext';
import HoverButtons from '~/components/Chat/Messages/HoverButtons';
import { AuthContext } from '~/hooks/AuthContext';

const conversation = {
  conversationId: 'convo-1',
  endpoint: EModelEndpoint.agents,
  title: 'Test',
} as TConversation;

const request = {
  messageId: 'user-1',
  conversationId: 'convo-1',
  parentMessageId: null,
  isCreatedByUser: true,
  text: '이번 주 회의록을 요약해줘',
} as TMessage;

const reply = {
  messageId: 'assistant-1',
  conversationId: 'convo-1',
  parentMessageId: 'user-1',
  isCreatedByUser: false,
  text: '요약입니다.',
} as TMessage;

function authWithCreate(canCreate: boolean): TAuthContext {
  return {
    isAuthenticated: true,
    user: { id: 'user-1', role: 'USER' },
    roles: {
      USER: {
        name: 'USER',
        permissions: {
          [PermissionTypes.SKILLS]: { [Permissions.USE]: true, [Permissions.CREATE]: canCreate },
        },
      },
    },
  } as unknown as TAuthContext;
}

function EditorProbe() {
  const location = useLocation();
  return <pre data-testid="editor-state">{JSON.stringify(location.state)}</pre>;
}

function renderReplyButtons({
  message = reply,
  canCreate = true,
  isSubmitting = false,
}: {
  message?: TMessage;
  canCreate?: boolean;
  isSubmitting?: boolean;
} = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const thread = [request, reply];
  render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <AuthContext.Provider value={authWithCreate(canCreate)}>
          <MessagesViewContext.Provider
            value={{ getMessages: () => thread } as unknown as MessagesViewContextValue}
          >
            <MemoryRouter initialEntries={['/c/convo-1']}>
              <Routes>
                <Route
                  path="/c/:conversationId"
                  element={
                    <HoverButtons
                      index={0}
                      isLast={true}
                      isEditing={false}
                      message={message}
                      conversation={conversation}
                      isSubmitting={isSubmitting}
                      enterEdit={jest.fn()}
                      regenerate={jest.fn()}
                      handleContinue={jest.fn()}
                      copyToClipboard={jest.fn()}
                      getCanCopy={() => true}
                      latestMessageId={message.messageId}
                    />
                  }
                />
                <Route path="/skills/new" element={<EditorProbe />} />
              </Routes>
            </MemoryRouter>
          </MessagesViewContext.Provider>
        </AuthContext.Provider>
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

describe('HoverButtons save as agent', () => {
  it('opens the editor with the request that produced this reply', () => {
    renderReplyButtons();

    fireEvent.click(screen.getByTestId('save-as-agent-button'));

    expect(JSON.parse(screen.getByTestId('editor-state').textContent ?? 'null')).toEqual({
      text: '이번 주 회의록을 요약해줘',
      from: 'chat',
      conversationId: 'convo-1',
    });
  });

  it('is absent when the user may not create agents', () => {
    renderReplyButtons({ canCreate: false });

    expect(screen.queryByTestId('save-as-agent-button')).toBeNull();
  });

  it('is absent under the user request itself', () => {
    renderReplyButtons({ message: request });

    expect(screen.queryByTestId('save-as-agent-button')).toBeNull();
  });

  it('is absent while the reply is still streaming', () => {
    renderReplyButtons({ isSubmitting: true });

    expect(screen.queryByTestId('save-as-agent-button')).toBeNull();
  });
});
