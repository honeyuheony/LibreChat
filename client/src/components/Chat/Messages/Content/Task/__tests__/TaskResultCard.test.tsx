import React from 'react';
import { createStore } from 'jotai';
import { dataService, EModelEndpoint } from 'librechat-data-provider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  TConversation,
  TMessage,
  TaskDocResult,
  TaskStats,
  TaskTableResult,
} from 'librechat-data-provider';
import type { TaskResultAttachment } from '../api';
import { CONVERSATION_ID, createTaskWrapper } from 'test/task-test-utils';
import { ChatContext } from '~/Providers/ChatContext';
import TaskResultCard from '../TaskResultCard';
import { taskPanelState } from '~/store/task';

const mockSubmitMessage = jest.fn();
const mockShowToast = jest.fn();
const mockCreateSchedule = jest.fn();
const mockHasSchedulePermission = jest.fn(() => true);
let mockSchedulesEnabled = true;
const mockCopy = jest.fn((_text: string, _options?: unknown) => true);

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) =>
    values == null ? key : `${key}:${Object.values(values).join('|')}`,
  useAuthContext: () => ({ user: { id: 'user-1' } }),
  useHasAccess: () => mockHasSchedulePermission(),
  useSubmitMessage: () => ({ submitMessage: mockSubmitMessage }),
}));
jest.mock('~/data-provider', () => ({
  useSubmitToolApprovalMutation: () => ({ mutate: jest.fn() }),
  useSubmitAskAnswerMutation: () => ({ mutate: jest.fn() }),
  useGetStartupConfig: () => ({ data: { interface: { schedules: mockSchedulesEnabled } } }),
}));
jest.mock('~/data-provider/Schedules', () => ({
  useCreateScheduleMutation: () => ({ mutate: mockCreateSchedule, isLoading: false }),
}));
jest.mock('~/data-provider/Skills', () => ({
  useListSkillsQuery: () => ({ data: undefined }),
}));
jest.mock('~/store/agents', () => ({ useGetEphemeralAgent: () => () => undefined }));
jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));
jest.mock('copy-to-clipboard', () => ({
  __esModule: true,
  default: (text: string, options?: unknown) => mockCopy(text, options),
}));
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getTaskResult: jest.fn(),
      getTaskResultExport: jest.fn(),
      getFileDownload: jest.fn(),
    },
  };
});

const mockFetchResult = jest.mocked(dataService.getTaskResult);
const mockFetchExcel = jest.mocked(dataService.getTaskResultExport);
const mockFetchFile = jest.mocked(dataService.getFileDownload);

/** jsdom에는 Object URL 구현이 없어 다운로드 테스트에서 대체한다. */
function stubObjectUrls(url: string) {
  const createObjectURL = jest.fn((_blob: Blob) => url);
  const revokeObjectURL = jest.fn((_url: string) => undefined);
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
  return { createObjectURL, revokeObjectURL };
}

const stats = (overrides: Partial<TaskStats> = {}): TaskStats => ({
  docs: 12,
  reflected: 12,
  none: 3,
  low: 1,
  textOnly: 0,
  cached: 0,
  seconds: 38,
  ...overrides,
});

const attachment = (overrides: Partial<TaskResultAttachment> = {}): TaskResultAttachment => ({
  resultId: 'result-1',
  kind: 'table',
  title: '비교표 · 3건',
  stats: stats(),
  ...overrides,
});

const cell = (value: string | null) => ({ value, status: value == null ? 'none' : 'ok' }) as const;

const tableResult: TaskTableResult = {
  kind: 'table',
  resultId: 'result-1',
  conversationId: 'conversation-1',
  title: '비교표 · 3건',
  fields: ['정세 전망', '전월 대비'],
  rows: [
    { file_id: 'f1', filename: 'a.hwp', parse: 'ok', cells: [cell('긴장 고조'), cell('상승')] },
    { file_id: 'f2', filename: 'b.pdf', parse: 'ok', cells: [cell('긴장 고조'), cell(null)] },
    { file_id: 'f3', filename: 'c.docx', parse: 'ok', cells: [cell('완화'), cell(null)] },
  ],
  stats: stats({ docs: 3, reflected: 3 }),
  extractor: { promptVersion: 'v3', model: 'm' },
  createdAt: '2026-09-26T10:00:00Z',
};

const summaryResult: TaskDocResult = {
  kind: 'summary',
  resultId: 'result-2',
  conversationId: 'conversation-1',
  title: '통합 요약 · 위험 요인 중심',
  view: '위험 요인 중심',
  body: '1. 전체 경향\n- 긴장 고조[^1]',
  footnotes: [
    { n: 1, file_id: 'f1', filename: 'a.pdf', evidence: { quote: '긴장이 높아졌다', page: 3 } },
    { n: 2, file_id: 'f2', filename: 'b.hwp', evidence: { quote: '완화 조짐', paragraph: 7 } },
  ],
  stats: stats(),
  createdAt: '2026-09-26T10:00:00Z',
};

function renderCard(
  result: TaskResultAttachment,
  { inChat = true, jotaiStore = createStore() } = {},
) {
  render(<TaskResultCard result={result} />, {
    wrapper: createTaskWrapper({ jotaiStore, inChat }),
  });
  return jotaiStore;
}

function renderCardWithMessages(result: TaskResultAttachment, messages: TMessage[]) {
  const BaseWrapper = createTaskWrapper({ inChat: false });
  const conversation: TConversation = {
    conversationId: CONVERSATION_ID,
    endpoint: EModelEndpoint.agents,
    title: 'New Chat',
    agent_id: 'agent-1',
    chatProjectId: 'project-1',
    file_ids: ['file-1'],
    createdAt: '2026-09-26T08:00:00.000Z',
    updatedAt: '2026-09-26T08:00:00.000Z',
  };
  const chatContext = {
    conversation,
    getMessages: () => messages,
  } as React.ContextType<typeof ChatContext>;
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <BaseWrapper>
        <ChatContext.Provider value={chatContext}>{children}</ChatContext.Provider>
      </BaseWrapper>
    );
  }
  render(<TaskResultCard result={result} />, { wrapper: Wrapper });
}

function userMessage(messageId: string, createdAt: string, manualSkills: string[]): TMessage {
  return {
    messageId,
    conversationId: CONVERSATION_ID,
    parentMessageId: null,
    text: '보고서를 작성해 주세요.',
    isCreatedByUser: true,
    createdAt,
    manualSkills,
  };
}

const buttonNames = () => screen.getAllByRole('button').map((button) => button.textContent ?? '');

beforeEach(() => {
  jest.clearAllMocks();
  mockHasSchedulePermission.mockReturnValue(true);
  mockSchedulesEnabled = true;
  mockFetchResult.mockResolvedValue(tableResult);
});

describe('TaskResultCard', () => {
  test('shows the coverage line from stats and the table note with none and low counts', () => {
    renderCard(attachment());

    expect(screen.getByTestId('task-result-scope')).toHaveTextContent('com_ui_task_scope:12|12|38');
    expect(screen.getByText('com_ui_task_result_table_note:3|1')).toBeInTheDocument();
    expect(buttonNames()).toEqual([
      'com_ui_task_open_table',
      'com_ui_task_excel',
      'com_ui_task_to_report',
      'com_ui_task_schedule_weekly',
    ]);
  });

  test('adds the cached label only when every document came from the cache', () => {
    renderCard(attachment({ stats: stats({ cached: 12 }) }));

    expect(screen.getByTestId('task-result-scope')).toHaveTextContent(
      'com_ui_task_scope:12|12|38 · com_ui_task_scope_cached',
    );
  });

  test('offers weekly schedule creation for a result shown in chat', () => {
    renderCard(attachment());

    expect(screen.getByRole('button', { name: 'com_ui_task_schedule_weekly' })).toBeInTheDocument();
  });

  test('hides weekly schedule creation when schedules are disabled', () => {
    mockSchedulesEnabled = false;
    renderCard(attachment());

    expect(
      screen.queryByRole('button', { name: 'com_ui_task_schedule_weekly' }),
    ).not.toBeInTheDocument();
  });

  test('hides weekly schedule creation without create permission', () => {
    mockHasSchedulePermission.mockReturnValue(false);
    renderCard(attachment());

    expect(
      screen.queryByRole('button', { name: 'com_ui_task_schedule_weekly' }),
    ).not.toBeInTheDocument();
  });

  test('creates a Monday schedule with the current chat agent', async () => {
    renderCard(attachment());

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_schedule_weekly' }));

    await waitFor(() =>
      expect(mockCreateSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '비교표 · 3건',
          prompt: '비교표 · 3건을 실행해 주세요.',
          agent_id: 'agent-1',
          cadence: { frequency: 'weekly', daysOfWeek: [1], hour: 9, minute: 0 },
          timezone: 'Asia/Seoul',
          target: 'new',
          enabled: true,
          clientRequestId: expect.any(String),
        }),
        expect.any(Object),
      ),
    );
  });

  test('uses the task result turn skill, project and files for its repeated schedule', async () => {
    renderCardWithMessages(attachment(), [
      userMessage('user-before-result', '2026-09-26T09:00:00.000Z', ['skill-at-result-time']),
      userMessage('user-after-result', '2026-09-26T11:00:00.000Z', ['later-skill']),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_schedule_weekly' }));

    await waitFor(() =>
      expect(mockCreateSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'skill-at-result-time',
          prompt: 'skill-at-result-time을 실행해 주세요.',
          skills: ['skill-at-result-time'],
          chatProjectId: 'project-1',
          file_ids: ['file-1'],
        }),
        expect.any(Object),
      ),
    );
  });

  test('lists the top values per field counted from the fetched rows', async () => {
    renderCard(attachment());

    expect(
      await screen.findByText('정세 전망: 긴장 고조 com_ui_task_count:2, 완화 com_ui_task_count:1'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '전월 대비: com_ui_task_value_none com_ui_task_count:2, 상승 com_ui_task_count:1',
      ),
    ).toBeInTheDocument();
    expect(mockFetchResult).toHaveBeenCalledWith('result-1');
  });

  test('opens the result in the task panel when the open button is pressed', () => {
    const jotaiStore = renderCard(attachment());

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_open_table' }));

    expect(jotaiStore.get(taskPanelState)).toEqual({
      open: true,
      view: 'result',
      resultId: 'result-1',
    });
  });

  test('leaves the task panel closed until the card is pressed', () => {
    const jotaiStore = renderCard(attachment());

    expect(jotaiStore.get(taskPanelState).open).toBe(false);
  });

  test('sends the report request text when the table is turned into an HWP report', () => {
    renderCard(attachment());

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_to_report' }));

    expect(mockSubmitMessage).toHaveBeenCalledTimes(1);
    expect(mockSubmitMessage).toHaveBeenCalledWith({ text: 'com_ui_task_to_report_prompt' });
  });

  test('omits the report button outside a chat', () => {
    renderCard(attachment(), { inChat: false });

    expect(screen.queryByRole('button', { name: 'com_ui_task_to_report' })).not.toBeInTheDocument();
  });

  test('downloads the Excel export named after the result title', async () => {
    const blob = new Blob(['xlsx']);
    mockFetchExcel.mockResolvedValue({ data: blob } as Awaited<
      ReturnType<typeof dataService.getTaskResultExport>
    >);
    const { createObjectURL, revokeObjectURL } = stubObjectUrls('blob:excel');
    renderCard(attachment());

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_excel' }));

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:excel'));
    expect(mockFetchExcel).toHaveBeenCalledWith('result-1');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });

  test('copies the summary in the same form as the task panel', async () => {
    mockFetchResult.mockResolvedValue(summaryResult);
    renderCard(attachment({ kind: 'summary', resultId: 'result-2', title: summaryResult.title }));

    expect(screen.getByText('com_ui_task_result_summary')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_copy' }));

    await waitFor(() => expect(mockCopy).toHaveBeenCalledTimes(1));
    expect(mockCopy.mock.calls[0][0]).toBe(
      [
        '1. 전체 경향',
        '- 긴장 고조[^1]',
        '',
        '[^1]: a.pdf (p.3) — "긴장이 높아졌다"',
        '[^2]: b.hwp (¶7) — "완화 조짐"',
      ].join('\n'),
    );
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'success',
      message: 'com_ui_task_copied',
    });
  });

  test('downloads the HWPX file of a report the same way the task panel does', async () => {
    const blob = new Blob(['hwpx']);
    mockFetchFile.mockResolvedValue({ data: blob } as Awaited<
      ReturnType<typeof dataService.getFileDownload>
    >);
    const { createObjectURL, revokeObjectURL } = stubObjectUrls('blob:hwpx');
    const file = { file_id: 'file-7', filename: '부처 표준 보고서 초안.hwpx' };
    renderCard(attachment({ kind: 'report', file }));

    expect(screen.getByText('com_ui_task_result_report')).toBeInTheDocument();
    expect(screen.getByText('com_ui_task_result_report_note:3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_hwp_download' }));

    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:hwpx'));
    expect(mockFetchFile).toHaveBeenCalledWith('user-1', 'file-7');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });

  test('says so when the HWPX file cannot be downloaded', async () => {
    mockFetchFile.mockRejectedValue(new Error('404'));
    renderCard(attachment({ kind: 'report', file: { file_id: 'file-7', filename: '초안.hwpx' } }));

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_hwp_download' }));

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        status: 'error',
        message: 'com_ui_task_download_error',
      }),
    );
  });

  test('shows the server notice and hides HWP download when the report has no file', () => {
    const notice = '보고서 양식이 등록되어 있지 않아 HWP 파일을 만들지 못했습니다.';
    renderCard(attachment({ kind: 'report', notice }));

    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(screen.queryByText('com_ui_task_result_report_no_file')).not.toBeInTheDocument();
    expect(buttonNames()).toEqual(['com_ui_task_open', 'com_ui_task_schedule_weekly']);
  });

  test('falls back to the stock text when a report without a file carries no notice', () => {
    renderCard(attachment({ kind: 'report' }));

    expect(screen.getByText('com_ui_task_result_report_no_file')).toBeInTheDocument();
  });
});
