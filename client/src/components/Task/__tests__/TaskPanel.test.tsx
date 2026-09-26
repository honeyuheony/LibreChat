import { RecoilRoot } from 'recoil';
import { ContentTypes } from 'librechat-data-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TMessage, TaskProgressEvent } from 'librechat-data-provider';
import type { JotaiStore } from 'test/harness';
import { taskPanelState, taskProgressByToolCallId } from '~/store/task';
import { ephemeralAgentByConvoId } from '~/store/agents';
import { mcpValuesAtomFamily } from '~/store/mcp';
import { IsolatedAtomStore } from 'test/harness';
import TaskPanel from '../TaskPanel';
import store from '~/store';

let mockMessages: TMessage[] = [];
let mockJobStatus: string | undefined;
const mockTaskResult = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${JSON.stringify(options)}` : key,
}));

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: () => ({ data: mockMessages }),
  useActiveJobStatus: () => mockJobStatus,
  useMCPServersQuery: () => ({
    data: {
      drive: { serverName: 'drive', title: '업무자료실' },
      mail: { serverName: 'mail', title: '업무 메일' },
      hidden: { serverName: 'hidden', chatMenu: false },
    },
  }),
}));

jest.mock('~/data-provider/Tasks/queries', () => ({
  useTaskResultQuery: (resultId: string) => mockTaskResult(resultId),
}));

jest.mock('~/hooks/Agents/useAgentToolPermissions', () => ({
  __esModule: true,
  default: (agentId: string | null) =>
    agentId === 'agent_1'
      ? { tools: ['search_mcp_drive', 'send_mcp_mail'], agent: { model: 'gpt-oss-120b' } }
      : { tools: undefined, agent: undefined },
}));

jest.mock('../TaskTable', () => ({
  __esModule: true,
  default: ({ result }: { result: { title: string } }) => <div>{`table:${result.title}`}</div>,
}));

jest.mock('../TaskDocView', () => ({
  __esModule: true,
  default: ({ result }: { result: { title: string } }) => <div>{`doc:${result.title}`}</div>,
}));

const toolCall = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({
    messageId: `m-${id}`,
    isCreatedByUser: false,
    content: [{ type: ContentTypes.TOOL_CALL, tool_call: { id, name, args: '{}', ...extra } }],
  }) as unknown as TMessage;

const withOutputs = () =>
  ({
    messageId: 'm-out',
    isCreatedByUser: false,
    createdAt: '2026-09-26T09:03:00',
    attachments: [
      {
        type: 'task_result',
        resultId: 'r-table',
        kind: 'table',
        title: '분야별 비교표',
        stats: { docs: 12, none: 3, reflected: 12 },
      },
      {
        type: 'task_result',
        resultId: 'r-summary',
        kind: 'summary',
        title: '통합 요약 · 위험 요인 중심',
        stats: { reflected: 12 },
      },
      {
        type: 'task_result',
        resultId: 'r-report',
        kind: 'report',
        title: '부처 표준 보고서 초안.hwp',
        stats: { reflected: 11 },
      },
    ],
  }) as unknown as TMessage;

const userFiles = () =>
  ({
    messageId: 'm-user',
    isCreatedByUser: true,
    files: [
      { file_id: 'f1', filename: 'sample_1.hwp' },
      { file_id: 'f2', filename: '추진계획.hwpx' },
    ],
  }) as unknown as TMessage;

type Setup = { agentId?: string; disabledMcp?: string[]; chatSelection?: string[] };

function renderPanel(
  seed?: (jotai: JotaiStore) => void,
  { agentId = 'agent_1', disabledMcp = [], chatSelection = [] }: Setup = {},
) {
  return render(
    <RecoilRoot
      initializeState={({ set }) => {
        set(store.conversationByIndex(0), {
          conversationId: 'c1',
          title: '9월 2주 주간보고 취합',
          endpoint: 'agents',
          agent_id: agentId,
          model: 'chat-model',
        } as never);
        set(ephemeralAgentByConvoId('c1'), { disabled_mcp: disabledMcp } as never);
      }}
    >
      <IsolatedAtomStore
        seed={(jotai) => {
          jotai.set(mcpValuesAtomFamily('c1'), chatSelection);
          seed?.(jotai);
        }}
      >
        <TaskPanel conversationId="c1" />
      </IsolatedAtomStore>
    </RecoilRoot>,
  );
}

describe('TaskPanel', () => {
  beforeEach(() => {
    mockMessages = [];
    mockJobStatus = undefined;
    mockTaskResult.mockReset();
    mockTaskResult.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it('heads the panel with the conversation title and the finished state', () => {
    mockMessages = [toolCall('t1', 'extract_table', { output: 'ok' })];
    renderPanel();
    expect(screen.getByText('9월 2주 주간보고 취합')).toBeInTheDocument();
    expect(screen.getByText('com_ui_task_status_done')).toBeInTheDocument();
  });

  it('shows awaiting approval while the task tool waits for its card', () => {
    mockMessages = [
      toolCall('t1', 'extract_table', {
        approval: { actionId: 'a', allowed_decisions: ['approve'] },
      }),
    ];
    renderPanel();
    expect(screen.getByText('com_ui_convo_awaiting_approval')).toBeInTheDocument();
    const now = screen
      .getAllByRole('listitem')
      .find((item) => item.getAttribute('data-state') === 'now');
    expect(now).toHaveTextContent('com_ui_task_stage_confirm_fields');
    expect(now).toHaveTextContent('com_ui_task_waiting_approval');
  });

  it('shows running while the job list reports the conversation running', () => {
    mockJobStatus = 'running';
    mockMessages = [toolCall('t1', 'summarize_documents')];
    renderPanel();
    expect(screen.getByText('com_ui_task_status_running')).toBeInTheDocument();
  });

  it.each([
    [
      'extract_table',
      [
        'com_ui_task_stage_prepare',
        'com_ui_task_stage_confirm_fields',
        'com_ui_task_stage_extract_all',
        'com_ui_task_stage_aggregate',
        'com_ui_task_stage_save',
      ],
    ],
    [
      'summarize_documents',
      [
        'com_ui_task_stage_prepare',
        'com_ui_task_stage_confirm_view',
        'com_ui_task_stage_summarize',
        'com_ui_task_stage_merge',
        'com_ui_task_stage_save',
      ],
    ],
    [
      'write_report',
      [
        'com_ui_task_stage_prepare',
        'com_ui_task_stage_extract',
        'com_ui_task_stage_compose',
        'com_ui_task_stage_render',
        'com_ui_task_stage_save',
      ],
    ],
  ])('lists the plan steps of %s', (name, labels) => {
    mockMessages = [toolCall('t1', name, { output: 'ok' })];
    renderPanel();
    const items = screen.getAllByRole('listitem').filter((item) => item.hasAttribute('data-state'));
    expect(items.map((item) => item.lastElementChild?.textContent)).toEqual(labels);
    expect(screen.getByText('5/5')).toBeInTheDocument();
  });

  it('shows the live stage label and count under the current step', () => {
    const progress: TaskProgressEvent = {
      toolCallId: 't1',
      stage: 'extract',
      done: 5,
      total: 12,
      label: '전체 문서에서 항목 추출',
    };
    mockMessages = [toolCall('t1', 'extract_table')];
    renderPanel((jotai) => jotai.set(taskProgressByToolCallId('t1'), progress));
    const now = screen
      .getAllByRole('listitem')
      .find((item) => item.getAttribute('data-state') === 'now');
    expect(now).toHaveTextContent('com_ui_task_stage_extract_all');
    expect(now).toHaveTextContent('전체 문서에서 항목 추출 · 5/12');
    expect(screen.getByText('2/5')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('lists three outputs with their kind icon and details', () => {
    mockMessages = [toolCall('t1', 'write_report', { output: 'ok' }), withOutputs()];
    renderPanel();
    const rows = screen.getAllByTestId('task-output-row');
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual([
      'com_ui_task_icon_table',
      'doc',
      'hwp',
    ]);
    expect(rows[0]).toHaveTextContent('com_ui_task_output_table_meta {"rows":12,"none":3} · 09:03');
    expect(rows[1]).toHaveTextContent('com_ui_task_output_doc_meta {"count":12} · 09:03');
    expect(rows[2]).toHaveTextContent('com_ui_task_output_doc_meta {"count":11} · 09:03');
  });

  it('explains the empty outputs list', () => {
    mockMessages = [toolCall('t1', 'extract_table')];
    renderPanel();
    expect(screen.getByText('com_ui_task_outputs_empty')).toBeInTheDocument();
  });

  it('opens a result screen from an output row and returns to the overview', () => {
    mockMessages = [toolCall('t1', 'extract_table', { output: 'ok' }), withOutputs()];
    mockTaskResult.mockImplementation((resultId: string) => ({
      data: resultId ? { kind: 'table', title: '분야별 비교표' } : undefined,
      isLoading: false,
      isError: false,
    }));
    renderPanel();
    fireEvent.click(screen.getAllByTestId('task-output-row')[0]);
    expect(mockTaskResult).toHaveBeenLastCalledWith('r-table');
    expect(screen.getByText('table:분야별 비교표')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /com_ui_task_overview/ }));
    expect(screen.getAllByTestId('task-output-row')).toHaveLength(3);
  });

  it('opens a summary result in the document view', () => {
    mockMessages = [toolCall('t1', 'summarize_documents', { output: 'ok' })];
    mockTaskResult.mockReturnValue({
      data: { kind: 'summary', title: '통합 요약' },
      isLoading: false,
      isError: false,
    });
    renderPanel((jotai) =>
      jotai.set(taskPanelState, { open: true, view: 'result', resultId: 'r-summary' }),
    );
    expect(screen.getByText('doc:통합 요약')).toBeInTheDocument();
  });

  it('says so when the result cannot be loaded', () => {
    mockTaskResult.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderPanel((jotai) =>
      jotai.set(taskPanelState, { open: true, view: 'result', resultId: 'r-x' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('com_ui_task_result_error');
  });

  it('lists the uploaded files and expands them one per row', () => {
    mockMessages = [userFiles(), toolCall('t1', 'extract_table')];
    renderPanel();
    expect(screen.getByText('com_ui_task_files_mine {"count":2}')).toBeInTheDocument();
    expect(screen.queryByText('sample_1.hwp')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('com_ui_task_files_mine {"count":2}'));
    expect(screen.getByText('sample_1.hwp')).toBeInTheDocument();
    expect(screen.getByText('추진계획.hwpx')).toBeInTheDocument();
  });

  it("shows a saved agent's connectors less those switched off, and its model", () => {
    mockMessages = [toolCall('t1', 'extract_table')];
    renderPanel(undefined, { agentId: 'agent_1', disabledMcp: ['mail'] });
    expect(screen.getByText('업무자료실').nextSibling).toHaveTextContent('com_ui_task_on');
    expect(screen.getByText('업무 메일').nextSibling).toHaveTextContent('com_ui_task_off');
    expect(screen.queryByText('hidden')).not.toBeInTheDocument();
    expect(screen.getByText('gpt-oss-120b').nextSibling).toHaveTextContent('com_ui_task_mode_task');
  });

  it('shows the chat selection when no saved agent runs the conversation', () => {
    mockMessages = [toolCall('t1', 'extract_table')];
    renderPanel(undefined, { agentId: '', chatSelection: ['mail'] });
    expect(screen.getByText('업무자료실').nextSibling).toHaveTextContent('com_ui_task_off');
    expect(screen.getByText('업무 메일').nextSibling).toHaveTextContent('com_ui_task_on');
    expect(screen.queryByText('hidden')).not.toBeInTheDocument();
    expect(screen.getByText('chat-model')).toBeInTheDocument();
  });

  it('says there are no attachments when no file was uploaded', () => {
    mockMessages = [toolCall('t1', 'extract_table')];
    renderPanel();
    expect(screen.getByText('com_ui_task_files_none')).toBeInTheDocument();
  });

  it('closes the panel from its header', () => {
    mockMessages = [toolCall('t1', 'extract_table')];
    let jotaiStore: JotaiStore | undefined;
    renderPanel((jotai) => {
      jotai.set(taskPanelState, { open: true, view: 'overview', resultId: null });
      jotaiStore = jotai;
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));
    expect(jotaiStore?.get(taskPanelState).open).toBe(false);
  });

  it('collapses a section from its heading', () => {
    mockMessages = [toolCall('t1', 'extract_table')];
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /com_ui_task_outputs/ }));
    expect(screen.queryByText('com_ui_task_outputs_empty')).not.toBeInTheDocument();
  });
});
