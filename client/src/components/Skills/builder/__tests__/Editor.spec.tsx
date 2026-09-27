import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TSkill } from 'librechat-data-provider';
import Editor, { MarketEditor } from '../Editor';

const mockUseGetSkillQuery = jest.fn();

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
    useCreateSkillMutation: mutation,
    useUpdateSkillMutation: mutation,
    usePublishSkillMutation: mutation,
    useForkSkillMutation: mutation,
    useCreateSkillDraftMutation: mutation,
    useRecordSkillTestResultMutation: mutation,
    useMCPServersQuery: () => ({ data: { confluence: {}, jira: {} } }),
    isSkillDraftRateLimited: () => false,
    postGenerationRequest: jest.fn(),
    generationProtocolHeaders: () => ({}),
  };
});

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

describe('Editor', () => {
  beforeEach(() => mockUseGetSkillQuery.mockReset());

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
});
