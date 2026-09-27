import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SkillDetailContent, { stripLeadingTitle } from '../SkillDetailContent';
import { ALL_SKILLS, weekly, weeklyFork } from '../__fixtures__/skills';

const mockNavigate = jest.fn();
const mockToggle = jest.fn();
const mockSetPendingSkills = jest.fn();

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('recoil', () => ({
  useSetRecoilState: (atom: string) =>
    atom === 'pendingManualSkills' ? mockSetPendingSkills : jest.fn(),
}));
jest.mock('~/store', () => ({
  __esModule: true,
  ephemeralAgentByConvoId: () => 'ephemeralAgent',
  default: { pendingManualSkillsByConvoId: () => 'pendingManualSkills' },
}));
jest.mock('@librechat/client', () => ({
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
  Spinner: () => <div data-testid="spinner" />,
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked: boolean;
    onCheckedChange: () => void;
    id: string;
    'aria-labelledby': string;
  }) => <button role="switch" aria-checked={checked} onClick={onCheckedChange} {...props} />,
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
  useSkillActiveState: () => ({ isActive: () => true, toggle: mockToggle, isLoading: false }),
}));
jest.mock('~/data-provider', () => ({
  useGetSkillQuery: () => ({
    isLoading: false,
    data: { body: '---\nname: x\n---\n1. 양식을 따른다.' },
  }),
}));
jest.mock('../../display/SkillMarkdownRenderer', () => ({ content }: { content: string }) => (
  <div data-testid="instructions">{content}</div>
));
jest.mock('../SkillFolderTree', () => () => <div data-testid="folder-tree" />);

function renderDetail(skill = weekly, onSelectSkill = jest.fn()) {
  render(<SkillDetailContent skill={skill} allSkills={ALL_SKILLS} onSelectSkill={onSelectSkill} />);
  return onSelectSkill;
}

describe('SkillDetailContent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the four impact numbers from the server metrics', () => {
    renderDetail();
    expect(screen.getByText('3,120')).toBeInTheDocument();
    expect(screen.getByText('1,317h')).toBeInTheDocument();
    expect(screen.getByText('com_skills_minutes:{"count":25}')).toBeInTheDocument();
    expect(screen.getByText('41')).toBeInTheDocument();
  });

  it('shows the response scope and previous department in the visibility note', () => {
    const { rerender } = render(
      <SkillDetailContent
        skill={{ ...weekly, scope: 'team', scopeDepartment: '옛 부서' }}
        allSkills={ALL_SKILLS}
        onSelectSkill={jest.fn()}
      />,
    );
    const scopeNote = () => screen.getByText((text) => text.includes('com_skills_detail_scope:'));

    expect(scopeNote()).toHaveTextContent('com_skills_scope_team_department');
    expect(scopeNote()).toHaveTextContent('옛 부서');

    rerender(
      <SkillDetailContent
        skill={{ ...weekly, scope: 'me', scopeDepartment: undefined }}
        allSkills={ALL_SKILLS}
        onSelectSkill={jest.fn()}
      />,
    );
    expect(scopeNote()).toHaveTextContent('com_skills_scope_me');
  });

  it('shows triggers, output and the instructions without frontmatter', () => {
    renderDetail();
    expect(screen.getByText('주간보고')).toBeInTheDocument();
    expect(screen.getByText('HWP 문서')).toBeInTheDocument();
    expect(screen.getByTestId('instructions')).toHaveTextContent(/^1\. 양식을 따른다\.$/);
  });

  it('shows connector titles as sources and hides the block when there are none', () => {
    renderDetail({
      ...weekly,
      marketProfile: { ...weekly.marketProfile, sources: ['공유 폴더', 'Google Workspace'] },
    });
    expect(screen.getByText('com_skills_sources')).toBeInTheDocument();
    expect(screen.getByText('공유 폴더')).toBeInTheDocument();
    expect(screen.getByText('Google Workspace')).toBeInTheDocument();
  });

  it('hides the sources block for a skill without sources', () => {
    renderDetail();
    expect(screen.queryByText('com_skills_sources')).toBeNull();
  });

  it('lists skills adapted from this one and opens them', () => {
    const onSelectSkill = renderDetail();
    fireEvent.click(screen.getByRole('button', { name: /주간보고 작성 \(교류협력팀\)/ }));
    expect(onSelectSkill).toHaveBeenCalledWith(weeklyFork);
  });

  it('links a fork back to its original', () => {
    renderDetail(weeklyFork);
    expect(screen.getByText('com_skills_lineage_origin')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /주간보고 작성 com_skills_lineage_origin/ }),
    ).toBeInTheDocument();
  });

  it('opens the adapt editor on the original', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_fork' }));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(`/skills/new?forkOf=${weekly._id}`);
  });

  it('shows the fork count from the server even when more copies are listed', () => {
    renderDetail({ ...weekly, forkCount: 0 });
    const forks = screen.getByText('com_skills_stat_forks').parentElement as HTMLElement;
    expect(forks).toHaveTextContent(/^0com_skills_stat_forks$/);
  });

  it('starts a chat with the example prefilled and the skill attached', () => {
    renderDetail({ ...weekly, examples: ['이번 주 팀원 주간보고를 취합해줘'] });
    fireEvent.click(screen.getByRole('button', { name: '이번 주 팀원 주간보고를 취합해줘' }));
    expect(mockNavigate).toHaveBeenCalledWith(
      `/c/new?prompt=${encodeURIComponent('이번 주 팀원 주간보고를 취합해줘')}`,
    );
    const addSkill = mockSetPendingSkills.mock.calls[0][0] as (prev: string[]) => string[];
    expect(addSkill([])).toEqual([weekly.name]);
  });

  it('toggles whether the skill appears in the / list', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('switch'));
    expect(mockToggle).toHaveBeenCalledWith(weekly);
  });
});

describe('stripLeadingTitle', () => {
  it('창 머리와 겹치는 본문 첫 줄의 h1 만 뺀다', () => {
    expect(stripLeadingTitle('# 문장 교정\n\n## 역할\n다듬는다.')).toBe('\n## 역할\n다듬는다.');
  });

  it('h1 으로 시작하지 않는 본문은 그대로 둔다', () => {
    expect(stripLeadingTitle('## 역할\n# 중간 제목')).toBe('## 역할\n# 중간 제목');
  });
});
