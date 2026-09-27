import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { dataService, EModelEndpoint, QueryKeys } from 'librechat-data-provider';
import type { TConversation, TMessage, TaskTableResult } from 'librechat-data-provider';
import type { TaskResultAttachment } from '../api';
import { CONVERSATION_ID, createTaskWrapper } from 'test/task-test-utils';
import { MessageSaveOffer, usedConnectors } from '../TaskSaveOffer';
import { ChatContext } from '~/Providers/ChatContext';
import TaskResultCard from '../TaskResultCard';

const mockCanCreateSkills = jest.fn(() => true);

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) =>
    values == null ? key : `${key}:${Object.values(values).join('|')}`,
  useAuthContext: () => ({ user: { id: 'user-1' } }),
  useHasAccess: ({ permissionType }: { permissionType: string }) =>
    permissionType === 'SKILLS' ? mockCanCreateSkills() : false,
  useSubmitMessage: () => ({ submitMessage: jest.fn() }),
}));
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { interface: { schedules: false } } }),
  useGetMessagesByConvoId: jest.requireActual('~/data-provider/Messages/queries')
    .useGetMessagesByConvoId,
}));
jest.mock('~/data-provider/Schedules', () => ({
  useCreateScheduleMutation: () => ({ mutate: jest.fn(), isLoading: false }),
}));
jest.mock('~/data-provider/Skills', () => ({
  useListSkillsQuery: () => ({ data: undefined }),
}));
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService, getTaskResult: jest.fn() } };
});

const mockFetchResult = jest.mocked(dataService.getTaskResult);

const REQUEST = '국가별 동향 문서에서 정세 전망을 뽑아 비교표로 만들어 줘';

const attachment: TaskResultAttachment = {
  resultId: 'result-1',
  kind: 'table',
  title: '비교표 · 2건',
  stats: { docs: 2, reflected: 2, none: 0, low: 0, textOnly: 0, cached: 0, seconds: 5 },
};

const tableResult: TaskTableResult = {
  kind: 'table',
  resultId: 'result-1',
  conversationId: CONVERSATION_ID,
  title: '비교표 · 2건',
  fields: ['정세 전망'],
  rows: [],
  stats: attachment.stats,
  extractor: { promptVersion: 'v3', model: 'm' },
  createdAt: '2026-09-27T10:00:00Z',
};

function userMessage(text: string, createdAt: string, manualSkills: string[] = []): TMessage {
  return {
    messageId: `user-${createdAt}`,
    conversationId: CONVERSATION_ID,
    parentMessageId: null,
    text,
    isCreatedByUser: true,
    createdAt,
    manualSkills,
  };
}

function toolReply(names: string[]): TMessage {
  return {
    messageId: 'reply-1',
    conversationId: CONVERSATION_ID,
    parentMessageId: null,
    text: '',
    isCreatedByUser: false,
    createdAt: '2026-09-27T09:59:00Z',
    content: names.map((name) => ({
      type: 'tool_call',
      tool_call: { id: name, name, args: '', type: 'tool_call' },
    })),
  } as unknown as TMessage;
}

function resultReply(messageId: string, resultId: string, createdAt: string): TMessage {
  return {
    messageId,
    conversationId: CONVERSATION_ID,
    parentMessageId: null,
    text: '',
    isCreatedByUser: false,
    createdAt,
    attachments: [{ type: 'task_result', task_result: { ...attachment, resultId } }],
  } as unknown as TMessage;
}

function BuilderProbe() {
  const location = useLocation();
  return <pre data-testid="builder-state">{JSON.stringify(location.state)}</pre>;
}

const conversation = {
  conversationId: CONVERSATION_ID,
  endpoint: EModelEndpoint.agents,
  title: 'New Chat',
  createdAt: '',
  updatedAt: '',
} as TConversation;

function renderInChat(messages: TMessage[], element: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });
  queryClient.setQueryData([QueryKeys.messages, CONVERSATION_ID], messages);
  const chatContext = {
    conversation,
    getMessages: () => queryClient.getQueryData<TMessage[]>([QueryKeys.messages, CONVERSATION_ID]),
  } as React.ContextType<typeof ChatContext>;
  const BaseWrapper = createTaskWrapper({ inChat: false });
  render(
    <MemoryRouter initialEntries={['/c/convo']}>
      <BaseWrapper>
        <QueryClientProvider client={queryClient}>
          <ChatContext.Provider value={chatContext}>
            <Routes>
              <Route path="/c/:id" element={element} />
              <Route path="/skills/new" element={<BuilderProbe />} />
            </Routes>
          </ChatContext.Provider>
        </QueryClientProvider>
      </BaseWrapper>
    </MemoryRouter>,
  );
  return queryClient;
}

const offerButton = () => screen.findByRole('button', { name: 'com_skills_chat_save_as_agent' });
const queryOffer = () => screen.queryByRole('button', { name: 'com_skills_chat_save_as_agent' });

beforeEach(() => {
  jest.clearAllMocks();
  mockCanCreateSkills.mockReturnValue(true);
  mockFetchResult.mockImplementation(async (resultId: string) => ({ ...tableResult, resultId }));
});

describe('save-as-agent offer at the end of the answer', () => {
  test('offers to save the finished task as an agent under the answer that carries it', async () => {
    renderInChat(
      [
        userMessage(REQUEST, '2026-09-27T09:58:00Z'),
        resultReply('reply-1', 'result-1', '2026-09-27T10:00:00Z'),
      ],
      <MessageSaveOffer messageId="reply-1" />,
    );

    expect(await offerButton()).toBeInTheDocument();
    expect(await offerButton()).toHaveClass(
      'bg-surface-submit',
      'h-7',
      'text-[13px]',
      'font-normal',
      'rounded-theme-control-round',
    );
    expect(screen.getByText('com_ui_task_save_agent_title')).toBeInTheDocument();
    expect(screen.getByText('com_ui_task_save_agent_body')).toBeInTheDocument();
  });

  test('is no longer part of the task result card', async () => {
    renderInChat(
      [
        userMessage(REQUEST, '2026-09-27T09:58:00Z'),
        resultReply('reply-1', 'result-1', '2026-09-27T10:00:00Z'),
      ],
      <TaskResultCard result={attachment} />,
    );

    await screen.findByTestId('task-result-card');
    await waitFor(() => expect(mockFetchResult).toHaveBeenCalledWith('result-1'));
    await act(async () => undefined);
    expect(queryOffer()).toBeNull();
  });

  test('opens the editor with the request, conversation, result and used connectors', async () => {
    renderInChat(
      [
        userMessage('앞선 질문', '2026-09-27T09:00:00Z'),
        userMessage(REQUEST, '2026-09-27T09:58:00Z'),
        toolReply(['search_mcp_confluence', 'extract_table', 'get_page_mcp_confluence']),
        resultReply('reply-2', 'result-1', '2026-09-27T10:00:00Z'),
        userMessage('결과 뒤의 질문', '2026-09-27T10:05:00Z'),
      ],
      <MessageSaveOffer messageId="reply-2" />,
    );

    fireEvent.click(await offerButton());

    expect(JSON.parse(screen.getByTestId('builder-state').textContent ?? '')).toEqual({
      from: 'chat',
      conversationId: CONVERSATION_ID,
      text: REQUEST,
      taskResultId: 'result-1',
      connectors: ['confluence'],
    });
  });

  test('shows once per conversation, under the answer with the latest result only', async () => {
    const messages = [
      userMessage('첫 요청', '2026-09-27T09:00:00Z'),
      resultReply('reply-a', 'result-a', '2026-09-27T09:01:00Z'),
      userMessage(REQUEST, '2026-09-27T09:58:00Z'),
      resultReply('reply-b', 'result-b', '2026-09-27T10:00:00Z'),
    ];
    renderInChat(
      messages,
      <>
        <div data-testid="answer-a">
          <MessageSaveOffer messageId="reply-a" />
        </div>
        <div data-testid="answer-b">
          <MessageSaveOffer messageId="reply-b" />
        </div>
      </>,
    );

    const offer = await offerButton();
    expect(screen.getByTestId('answer-a')).toBeEmptyDOMElement();
    fireEvent.click(offer);

    expect(JSON.parse(screen.getByTestId('builder-state').textContent ?? '')).toMatchObject({
      text: REQUEST,
      taskResultId: 'result-b',
    });
  });

  test('moves to the newer answer when another result arrives in the conversation', async () => {
    const earlier = [
      userMessage(REQUEST, '2026-09-27T09:58:00Z'),
      resultReply('reply-a', 'result-a', '2026-09-27T10:00:00Z'),
    ];
    const queryClient = renderInChat(
      earlier,
      <>
        <div data-testid="answer-a">
          <MessageSaveOffer messageId="reply-a" />
        </div>
        <div data-testid="answer-b">
          <MessageSaveOffer messageId="reply-b" />
        </div>
      </>,
    );
    await offerButton();
    expect(screen.getByTestId('answer-b')).toBeEmptyDOMElement();

    act(() => {
      queryClient.setQueryData(
        [QueryKeys.messages, CONVERSATION_ID],
        [
          ...earlier,
          userMessage('다음 요청', '2026-09-27T10:10:00Z'),
          resultReply('reply-b', 'result-b', '2026-09-27T10:11:00Z'),
        ],
      );
    });

    await waitFor(() => expect(screen.getByTestId('answer-a')).toBeEmptyDOMElement());
    expect(await offerButton()).toBeInTheDocument();
    expect(screen.getByTestId('answer-b')).not.toBeEmptyDOMElement();
  });

  test('does not offer when the request already ran a saved agent', async () => {
    renderInChat(
      [
        userMessage(REQUEST, '2026-09-27T09:58:00Z', ['weekly-trend']),
        resultReply('reply-1', 'result-1', '2026-09-27T10:00:00Z'),
      ],
      <MessageSaveOffer messageId="reply-1" />,
    );

    await waitFor(() => expect(mockFetchResult).toHaveBeenCalledWith('result-1'));
    await act(async () => undefined);
    expect(queryOffer()).toBeNull();
  });

  test('does not offer without permission to create agents', async () => {
    mockCanCreateSkills.mockReturnValue(false);
    renderInChat(
      [
        userMessage(REQUEST, '2026-09-27T09:58:00Z'),
        resultReply('reply-1', 'result-1', '2026-09-27T10:00:00Z'),
      ],
      <MessageSaveOffer messageId="reply-1" />,
    );

    await act(async () => undefined);
    expect(mockFetchResult).not.toHaveBeenCalled();
    expect(screen.queryByText('com_ui_task_save_agent_title')).toBeNull();
  });
});

describe('usedConnectors', () => {
  test('lists each MCP server once from the tool calls and ignores built-in tools', () => {
    expect(
      usedConnectors([
        toolReply(['search_mcp_confluence', 'extract_table']),
        toolReply(['get_issue_mcp_jira', 'get_page_mcp_confluence']),
      ]),
    ).toEqual(['confluence', 'jira']);
  });
});
