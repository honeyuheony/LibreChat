import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { dataService, EModelEndpoint } from 'librechat-data-provider';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { TConversation, TMessage, TaskTableResult } from 'librechat-data-provider';
import type { TaskResultAttachment } from '../api';
import { CONVERSATION_ID, createTaskWrapper } from 'test/task-test-utils';
import { ChatContext } from '~/Providers/ChatContext';
import { usedConnectors } from '../TaskSaveOffer';
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

function BuilderProbe() {
  const location = useLocation();
  return <pre data-testid="builder-state">{JSON.stringify(location.state)}</pre>;
}

function renderCard(messages: TMessage[]) {
  const BaseWrapper = createTaskWrapper({ inChat: false });
  const conversation = {
    conversationId: CONVERSATION_ID,
    endpoint: EModelEndpoint.agents,
    title: 'New Chat',
    createdAt: '',
    updatedAt: '',
  } as TConversation;
  const chatContext = { conversation, getMessages: () => messages } as React.ContextType<
    typeof ChatContext
  >;
  render(
    <MemoryRouter initialEntries={['/c/convo']}>
      <BaseWrapper>
        <ChatContext.Provider value={chatContext}>
          <Routes>
            <Route path="/c/:id" element={<TaskResultCard result={attachment} />} />
            <Route path="/skills/new" element={<BuilderProbe />} />
          </Routes>
        </ChatContext.Provider>
      </BaseWrapper>
    </MemoryRouter>,
  );
}

const offerButton = () => screen.findByRole('button', { name: 'com_skills_chat_save_as_agent' });

beforeEach(() => {
  jest.clearAllMocks();
  mockCanCreateSkills.mockReturnValue(true);
  mockFetchResult.mockResolvedValue(tableResult);
});

describe('save-as-agent offer under a task result', () => {
  test('offers to save the finished task as an agent', async () => {
    renderCard([userMessage(REQUEST, '2026-09-27T09:58:00Z')]);

    expect(await offerButton()).toBeInTheDocument();
    expect(screen.getByText('com_ui_task_save_agent_title')).toBeInTheDocument();
    expect(screen.getByText('com_ui_task_save_agent_body')).toBeInTheDocument();
  });

  test('opens the editor with the request, conversation, result and used connectors', async () => {
    renderCard([
      userMessage('앞선 질문', '2026-09-27T09:00:00Z'),
      userMessage(REQUEST, '2026-09-27T09:58:00Z'),
      toolReply(['search_mcp_confluence', 'extract_table', 'get_page_mcp_confluence']),
      userMessage('결과 뒤의 질문', '2026-09-27T10:05:00Z'),
    ]);

    fireEvent.click(await offerButton());

    expect(JSON.parse(screen.getByTestId('builder-state').textContent ?? '')).toEqual({
      from: 'chat',
      conversationId: CONVERSATION_ID,
      text: REQUEST,
      taskResultId: 'result-1',
      connectors: ['confluence'],
    });
  });

  test('does not offer when the request already ran a saved agent', async () => {
    renderCard([userMessage(REQUEST, '2026-09-27T09:58:00Z', ['weekly-trend'])]);

    await screen.findByTestId('task-result-card');
    await Promise.resolve();
    expect(mockFetchResult).toHaveBeenCalledWith('result-1');
    expect(screen.queryByRole('button', { name: 'com_skills_chat_save_as_agent' })).toBeNull();
  });

  test('does not offer without permission to create agents', async () => {
    mockCanCreateSkills.mockReturnValue(false);
    renderCard([userMessage(REQUEST, '2026-09-27T09:58:00Z')]);

    await screen.findByTestId('task-result-card');
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
