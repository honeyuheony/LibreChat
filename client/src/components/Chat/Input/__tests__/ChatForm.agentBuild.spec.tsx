/**
 * @jest-environment-options {"url": "http://localhost:9"}
 */
import React, { useMemo, useState } from 'react';
import '@testing-library/jest-dom';
import { DndProvider } from 'react-dnd';
import { useForm } from 'react-hook-form';
import { RecoilRoot, useRecoilState } from 'recoil';
import userEvent from '@testing-library/user-event';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryKeys, Permissions, EModelEndpoint, PermissionTypes } from 'librechat-data-provider';
import type { TFile, TConversation } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import { AuthContext, AuthContextProvider, useAuthContext } from '~/hooks/AuthContext';
import { ChatContext, ChatFormProvider } from '~/Providers';
import ChatForm from '../ChatForm';
import store from '~/store';

const conversation = {
  conversationId: 'convo-1',
  endpoint: EModelEndpoint.openAI,
  model: 'gpt-4o',
  title: 'Chat',
} as TConversation;

const ask = jest.fn();

function WithSkillPermissions({
  canCreate,
  children,
}: {
  canCreate: boolean;
  children: React.ReactNode;
}) {
  const auth = useAuthContext();
  const value = useMemo(
    () => ({
      ...auth,
      isAuthenticated: true,
      user: { ...auth.user, id: 'user-1', role: 'USER' } as NonNullable<typeof auth.user>,
      roles: {
        USER: {
          name: 'USER',
          permissions: {
            [PermissionTypes.SKILLS]: {
              [Permissions.USE]: true,
              [Permissions.CREATE]: canCreate,
            },
          },
        },
      } as unknown as NonNullable<typeof auth.roles>,
    }),
    [auth, canCreate],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function Harness() {
  const [files, setFiles] = useRecoilState(store.filesByIndex(0));
  const [isSubmitting] = useRecoilState(store.isSubmittingFamily(0));
  const [, setFilesLoading] = useState(false);
  const methods = useForm<ChatFormValues>({ defaultValues: { text: '' } });

  const chatHelpers = useMemo(
    () =>
      ({
        index: 0,
        conversation,
        setConversation: () => undefined,
        files,
        setFiles,
        isSubmitting,
        setIsSubmitting: () => undefined,
        filesLoading: false,
        setFilesLoading,
        newConversation: () => undefined,
        handleStopGenerating: () => undefined,
        stopGenerating: () => undefined,
        getMessages: () => [],
        setMessages: () => undefined,
        ask,
        regenerate: () => undefined,
        setSiblingIdx: () => undefined,
        showPopover: false,
        setShowPopover: () => undefined,
        abortScroll: false,
        setAbortScroll: () => undefined,
        preset: null,
        setPreset: () => undefined,
        optionSettings: {},
        setOptionSettings: () => undefined,
        handleRegenerate: () => undefined,
        handleContinue: () => undefined,
      }) as unknown as React.ContextType<typeof ChatContext>,
    [files, setFiles, isSubmitting],
  );

  return (
    <ChatFormProvider {...methods}>
      <ChatContext.Provider value={chatHelpers}>
        <ChatForm index={0} isLandingPage={false} footerBelow={false} centerFormOnLanding={false} />
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

function EditorProbe() {
  const location = useLocation();
  return <pre data-testid="editor-state">{JSON.stringify(location.state)}</pre>;
}

function renderComposer({ canCreate = true }: { canCreate?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData<TFile[]>([QueryKeys.files], []);
  queryClient.setQueryData([QueryKeys.endpoints], { [EModelEndpoint.openAI]: { order: 0 } });

  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot>
        <MemoryRouter initialEntries={['/c/convo-1']}>
          <AuthContextProvider authConfig={{ loginRedirect: '', test: true }}>
            <WithSkillPermissions canCreate={canCreate}>
              <DndProvider backend={HTML5Backend}>
                <Routes>
                  <Route path="/c/:conversationId" element={<Harness />} />
                  <Route path="/skills/new" element={<EditorProbe />} />
                </Routes>
              </DndProvider>
            </WithSkillPermissions>
          </AuthContextProvider>
        </MemoryRouter>
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

async function typeAndSend(text: string) {
  const user = userEvent.setup();
  const input = await screen.findByTestId('text-input');
  await user.type(input, text);
  await user.click(screen.getByTestId('send-button'));
}

describe('ChatForm agent build request', () => {
  beforeEach(() => {
    localStorage.clear();
    ask.mockClear();
  });

  test('opens the editor with the tail removed instead of asking the model', async () => {
    renderComposer();

    await typeAndSend('보고서 쓰는 agent 만들어줘');

    const probe = await screen.findByTestId('editor-state');
    expect(JSON.parse(probe.textContent ?? 'null')).toEqual({
      text: '보고서 쓰는',
      from: 'chat',
      conversationId: 'convo-1',
    });
    expect(ask).not.toHaveBeenCalled();
  }, 20000);

  test('sends a question about making agents to the model as usual', async () => {
    renderComposer();

    await typeAndSend('agent 만드는 법 알려줘');

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(ask.mock.calls[0][0]).toEqual(
      expect.objectContaining({ text: 'agent 만드는 법 알려줘' }),
    );
    expect(screen.queryByTestId('editor-state')).not.toBeInTheDocument();
  }, 20000);

  test('sends as usual when the user may not create agents', async () => {
    renderComposer({ canCreate: false });

    await typeAndSend('보고서 쓰는 agent 만들어줘');

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('editor-state')).not.toBeInTheDocument();
  }, 20000);
});
