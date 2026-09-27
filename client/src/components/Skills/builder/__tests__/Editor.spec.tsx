import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { TSkill, TSkillDraft, TaskTableResult } from 'librechat-data-provider';
import Editor, { MarketEditor } from '../Editor';
import { DRAFT_DEBOUNCE_MS } from '../useDraft';

const mockUseGetSkillQuery = jest.fn();
const mockUseTaskResultQuery = jest.fn();
const mockRequestDraft = jest.fn();
const mockUseSkillsInfiniteQuery = jest.fn();

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('~/components/Skills/Marketplace/SkillMarketplace', () => ({
  __esModule: true,
  default: () => <main data-testid="skill-market" />,
}));

jest.mock('~/components/Agents/MarketplaceContext', () => ({
  MarketplaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
  useHasAccess: () => true,
  useAuthContext: () => ({
    user: { id: 'user-hong', name: '홍길동', role: 'USER', department: '교류협력팀' },
    roles: { USER: {} },
    token: 'token',
  }),
}));

jest.mock('~/data-provider', () => {
  const mutation = () => ({ mutateAsync: jest.fn() });
  return {
    useGetSkillQuery: (id: string, config?: { enabled?: boolean }) =>
      mockUseGetSkillQuery(id, config),
    useGetStartupConfig: () => ({ data: undefined }),
    useSkillsInfiniteQuery: (params: unknown, config?: { enabled?: boolean }) =>
      mockUseSkillsInfiniteQuery(params, config),
    useCreateSkillMutation: mutation,
    useUpdateSkillMutation: mutation,
    usePublishSkillMutation: mutation,
    useForkSkillMutation: mutation,
    useCreateSkillDraftMutation: () => ({ mutateAsync: mockRequestDraft }),
    useRecordSkillTestResultMutation: mutation,
    useMCPServersQuery: () => ({ data: { confluence: {}, jira: {} } }),
    isSkillDraftRateLimited: () => false,
    postGenerationRequest: jest.fn(),
    generationProtocolHeaders: () => ({}),
  };
});

jest.mock('~/data-provider/Tasks', () => ({
  useTaskResultQuery: (id: string | null | undefined) => mockUseTaskResultQuery(id),
}));

const original = {
  _id: 'orig-1',
  name: 'weekly-report',
  displayTitle: '주간보고 작성',
  description: '팀원 주간보고를 취합한다.',
  body: '# 주간보고 작성\n\n1. 금주 실적과 차주 계획을 나눈다.\n',
  frontmatter: { metadata: { output: 'report', triggers: ['주간보고'] } },
  author: 'someone-else',
  authorName: '박지원',
  version: 3,
  source: 'user',
  fileCount: 0,
  createdAt: '',
  updatedAt: '',
} as unknown as TSkill;

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/skills/new" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );
}

const tableResult: TaskTableResult = {
  kind: 'table',
  resultId: 'result-1',
  conversationId: 'convo-1',
  title: '비교표 · 2건',
  fields: ['정세 전망', '전월 대비'],
  rows: [
    { file_id: 'f1', filename: '미국 동향.hwp', parse: 'ok', cells: [] },
    { file_id: 'f2', filename: '일본 동향.pdf', parse: 'ok', cells: [] },
  ],
  stats: { docs: 2, reflected: 2, none: 0, low: 0, textOnly: 0, cached: 0, seconds: 5 },
  extractor: { promptVersion: 'v3', model: 'm' },
  createdAt: '2026-09-27T00:00:00Z',
};

const modelDraft: TSkillDraft = {
  slug: 'trend-table',
  title: 'AI 가 지은 이름',
  description: '동향 문서를 비교한다',
  triggers: ['동향'],
  output: 'report',
  extras: [],
  fields: ['AI 항목'],
  icon: '📊',
  steps: [],
  connectors: [],
  fileKinds: [],
  origin: 'model',
};

const chatEntry = {
  from: 'chat',
  conversationId: 'convo-1',
  text: '국가별 동향 문서에서 정세 전망을 뽑아 비교표로 만들어 줘',
  taskResultId: 'result-1',
  connectors: ['confluence'],
};

function renderFromChat(state: Record<string, unknown>) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/skills/new', state }]}>
      <Routes>
        <Route path="/skills/new" element={<Editor />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Editor', () => {
  beforeEach(() => {
    mockUseGetSkillQuery.mockReset();
    mockUseTaskResultQuery.mockReset();
    mockUseTaskResultQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    mockRequestDraft.mockReset();
    mockRequestDraft.mockResolvedValue(modelDraft);
    mockUseSkillsInfiniteQuery.mockReset();
    mockUseSkillsInfiniteQuery.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('opens the adapt editor filled with the original named in forkOf', () => {
    mockUseGetSkillQuery.mockReturnValue({ data: original, isLoading: false, isError: false });
    renderAt('/skills/new?forkOf=orig-1');

    expect(mockUseGetSkillQuery.mock.calls[0][0]).toBe('orig-1');
    expect(
      screen.getByText('com_skills_builder_fork_title:{"name":"주간보고 작성"}'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('com_skills_builder_how')).toHaveValue(
      '금주 실적과 차주 계획을 나눈다.',
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      '주간보고 작성 (교류협력팀)',
    );
  });

  it('waits for the original before showing the editor', () => {
    mockUseGetSkillQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderAt('/skills/new?forkOf=orig-1');
    expect(screen.queryByLabelText('com_skills_builder_how')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('com_skills_builder_text_heading')).not.toBeInTheDocument();
  });

  it('opens an empty editor without forkOf and does not load a skill', () => {
    mockUseGetSkillQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    renderAt('/skills/new');
    expect(screen.getByLabelText('com_skills_builder_text_heading')).toHaveValue('');
    expect(screen.getByText('com_skills_new_agent')).toBeInTheDocument();
  });

  it('shows the editor as a dialog over the marketplace on skills/new', () => {
    mockUseGetSkillQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(
      <MemoryRouter initialEntries={['/skills/new']}>
        <Routes>
          <Route path="/skills/new" element={<MarketEditor />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('skill-market')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'com_skills_new_agent' })).toBeInTheDocument();
  });

  it('offers every MCP server the person can reach as a connector choice', () => {
    mockUseGetSkillQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    renderAt('/skills/new');
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_connectors_more' }));
    expect(screen.getAllByRole('switch').map((item) => item.closest('label')?.textContent)).toEqual(
      ['confluence', 'jira'],
    );
  });

  it('loads the text of the top examples only once the list is opened, then copies one', () => {
    const summaries = [
      {
        ...original,
        _id: 'peer-a',
        displayTitle: '회의록 정리',
        category: '정리·분석',
        useCount: 90,
      },
      { ...original, _id: 'peer-b', displayTitle: '출장보고', category: '문서작성', useCount: 5 },
      { ...original, _id: 'peer-c', displayTitle: '보도자료', category: '문서작성', useCount: 40 },
      { ...original, _id: 'peer-d', displayTitle: '용어 번역', category: '번역·교정', useCount: 1 },
    ];
    mockUseSkillsInfiniteQuery.mockReturnValue({
      data: { pages: [{ skills: summaries }] },
      isLoading: false,
    });
    mockUseGetSkillQuery.mockImplementation((id: string | null) => ({
      data: id ? summaries.find((skill) => skill._id === id) : undefined,
      isLoading: false,
      isError: false,
    }));
    renderAt('/skills/new');
    expect(mockUseGetSkillQuery.mock.calls.every(([id]) => id == null)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_peek' }));
    const loaded = new Set(mockUseGetSkillQuery.mock.calls.map(([id]) => id).filter(Boolean));
    expect(loaded).toEqual(new Set(['peer-c', 'peer-b', 'peer-a']));
    expect(
      Array.from(screen.getByRole('list', { name: 'com_skills_builder_peek' }).children).map(
        (item) => item.querySelector('b')?.textContent,
      ),
    ).toEqual(['보도자료', '출장보고', '회의록 정리']);

    fireEvent.click(screen.getAllByRole('button', { name: 'com_skills_builder_peek_copy' })[0]);
    expect(screen.getByLabelText('com_skills_builder_how')).toHaveValue(
      '금주 실적과 차주 계획을 나눈다.',
    );
  });

  describe('from a finished task', () => {
    beforeEach(() => {
      mockUseGetSkillQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false });
      jest.useFakeTimers();
    });
    afterEach(() => jest.useRealTimers());

    it('waits for the task result before showing the editor', () => {
      mockUseTaskResultQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
      renderFromChat(chatEntry);

      expect(mockUseTaskResultQuery).toHaveBeenCalledWith('result-1');
      expect(screen.queryByLabelText('com_skills_builder_text_heading')).not.toBeInTheDocument();
    });

    it('fills the request, output, fields, documents and connectors as settled in the chat', () => {
      mockUseTaskResultQuery.mockReturnValue({
        data: tableResult,
        isLoading: false,
        isError: false,
      });
      renderFromChat(chatEntry);

      expect(screen.getByText('com_skills_chat_save_as_agent')).toBeInTheDocument();
      expect(screen.getByLabelText('com_skills_builder_text_heading')).toHaveValue(chatEntry.text);
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
        '정세 전망·전월 대비 비교표',
      );
      expect(screen.getAllByText('com_skills_builder_source_chat')).toHaveLength(4);
      expect(screen.getByRole('switch', { checked: true })).toHaveAccessibleName(/confluence/);
      const files = screen.getByRole('list', { name: 'com_skills_builder_files_list' });
      expect(
        within(files)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        '미국 동향.hwpcom_skills_builder_file_kind_examples',
        '일본 동향.pdfcom_skills_builder_file_kind_examples',
      ]);
    });

    it('sends the conversation with the draft request and keeps the settled cells', async () => {
      mockUseTaskResultQuery.mockReturnValue({
        data: tableResult,
        isLoading: false,
        isError: false,
      });
      renderFromChat(chatEntry);
      await act(async () => {
        jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
      });

      expect(mockRequestDraft).toHaveBeenCalledTimes(1);
      expect(mockRequestDraft.mock.calls[0][0]).toEqual({
        text: chatEntry.text,
        direct: false,
        context: { conversationId: 'convo-1' },
      });
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
        '정세 전망·전월 대비 비교표',
      );
      expect(screen.getByText('동향 문서를 비교한다')).toBeInTheDocument();
      expect(screen.getAllByText('com_skills_builder_source_chat')).toHaveLength(4);
    });

    it('opens with the request alone when the task result cannot be read', () => {
      mockUseTaskResultQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
      renderFromChat(chatEntry);

      expect(screen.getByLabelText('com_skills_builder_text_heading')).toHaveValue(chatEntry.text);
      expect(screen.queryByText('com_skills_builder_source_chat')).not.toBeInTheDocument();
    });

    it('does not read a task result when the chat entry has none', () => {
      renderFromChat({ from: 'chat', conversationId: 'convo-1', text: chatEntry.text });

      expect(mockUseTaskResultQuery).not.toHaveBeenCalledWith(expect.any(String));
      expect(screen.getByLabelText('com_skills_builder_text_heading')).toHaveValue(chatEntry.text);
    });
  });
});
