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
  Button: ({
    children,
    className,
    type,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    className?: string;
    type?: 'button';
    'aria-label'?: string;
  }) => (
    <button type={type} className={className} aria-label={ariaLabel}>
      {children}
    </button>
  ),
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
  OGDialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  OGDialogContent: ({
    children,
    className,
    overlayClassName,
  }: {
    children: React.ReactNode;
    className?: string;
    overlayClassName?: string;
  }) => (
    <div data-testid="dialog-content" className={overlayClassName}>
      <div data-testid="dialog-panel" className={className}>
        {children}
      </div>
    </div>
  ),
}));
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
  useSkillActiveState: () => ({ isActive: () => true, toggle: mockToggle, isLoading: false }),
}));
let mockSkillBody = '---\nname: x\n---\n1. 양식을 따른다.';

jest.mock('~/data-provider', () => ({
  useGetSkillQuery: () => ({
    isLoading: false,
    data: { body: mockSkillBody },
  }),
}));
jest.mock('../SkillFolderTree', () => () => <div data-testid="folder-tree" />);

function renderDetail(skill = weekly, onSelectSkill = jest.fn()) {
  render(<SkillDetailContent skill={skill} allSkills={ALL_SKILLS} onSelectSkill={onSelectSkill} />);
  return onSelectSkill;
}

describe('SkillDetailContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSkillBody = '---\nname: x\n---\n1. 양식을 따른다.';
  });

  it('shows the four impact numbers from the server metrics', () => {
    renderDetail();
    expect(screen.getByText('3,120')).toBeInTheDocument();
    expect(screen.getByText('1,317h')).toBeInTheDocument();
    expect(screen.getByText('com_skills_minutes:{"count":25}')).toBeInTheDocument();
    expect(screen.getByText('41')).toBeInTheDocument();
  });

  it('keeps trigger instructions out of the summary and shows trigger tags separately', () => {
    const skill = {
      ...weekly,
      description:
        '회의 메모·녹취록에서 결정 사항과 담당자·기한별 할 일을 뽑아 공유 메일 초안까지 작성. 회의록에서 액션아이템을 뽑아 달라, 담당자별 할 일을 정리해 달라, 할 일을 공유 메일 초안으로 써 달라고 할 때 씁니다.',
      examples: ['회의록에서 액션아이템을 뽑아 달라'],
      marketProfile: { ...weekly.marketProfile, triggers: ['회의록', '액션아이템'] },
    };
    renderDetail(skill);

    expect(
      screen.getByText(
        '회의 메모·녹취록에서 결정 사항과 담당자·기한별 할 일을 뽑아 공유 메일 초안까지 작성.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/할 때 씁니다/)).not.toBeInTheDocument();
    expect(screen.getByText('com_skills_when')).toBeInTheDocument();
    expect(screen.getByText('회의록')).toBeInTheDocument();
    expect(screen.getByText('액션아이템')).toBeInTheDocument();
  });

  it('strips trigger sentences from deployed skill descriptions ending with 쓴다', () => {
    const descriptions = [
      {
        title: '회의록 → 액션아이템',
        description:
          '회의록 → 액션아이템: 회의 메모·녹취록에서 결정 사항과 담당자·기한별 할 일을 뽑아 공유 메일 초안까지 작성. 회의록에서 액션아이템을 뽑아 달라, 담당자별 할 일을 정리해 달라, 할 일을 공유 메일 초안으로 써 달라고 할 때 쓴다.',
        summary:
          '회의 메모·녹취록에서 결정 사항과 담당자·기한별 할 일을 뽑아 공유 메일 초안까지 작성.',
        triggers: ['회의록', '액션아이템'],
      },
      {
        title: '주간보고 작성',
        description:
          '주간보고 작성: 메일로 받은 팀원 주간보고를 모아 금주 실적·차주 계획·이슈로 정리한 팀 주간보고(HWP) 작성. 팀원 주간보고를 취합해 달라, 이번 주 팀 주간보고를 써 달라, 지난주와 달라진 이슈만 뽑아 달라고 할 때 쓴다.',
        summary:
          '메일로 받은 팀원 주간보고를 모아 금주 실적·차주 계획·이슈로 정리한 팀 주간보고(HWP) 작성.',
        triggers: ['주간보고'],
      },
      {
        title: '북한 정세 주간 브리핑',
        description:
          '북한 정세 주간 브리핑: 공개 매체 모니터링 자료와 북한 동향 DB를 모아 분야별 주간 정세 브리핑(HWP) 작성. 이번 주 북한 정세 브리핑을 만들어 달라, 분야별 주간 동향을 정리해 달라, 주간 정세 브리핑 양식으로 써 달라고 할 때 쓴다.',
        summary: '공개 매체 모니터링 자료와 북한 동향 DB를 모아 분야별 주간 정세 브리핑(HWP) 작성.',
        triggers: ['정세 브리핑', '주간 정세', '동향 브리핑'],
      },
    ];

    for (const { title, description, summary, triggers } of descriptions) {
      const { unmount } = render(
        <SkillDetailContent
          skill={{
            ...weekly,
            displayTitle: title,
            description,
            marketProfile: { ...weekly.marketProfile, triggers },
          }}
          allSkills={ALL_SKILLS}
          onSelectSkill={jest.fn()}
        />,
      );

      expect(screen.getByText(summary, { selector: 'p' })).toBeInTheDocument();
      expect(screen.queryByText(/할 때 쓴다\./)).not.toBeInTheDocument();
      unmount();
    }
  });

  it('matches the detail window close button size', () => {
    renderDetail();

    expect(screen.getByRole('button', { name: 'com_ui_close' })).toHaveClass(
      'absolute',
      'right-3',
      'top-3',
      'h-[27px]',
      'w-[35px]',
      'text-[13px]',
    );
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

  it('renders the instruction section as steps and labels the automatic model', () => {
    mockSkillBody = [
      '---',
      'name: weekly-report',
      '---',
      '# 주간보고 작성',
      '## 역할',
      '회의 내용을 정리합니다.',
      '## 실행 단계',
      '1. 결정 사항을 추립니다.',
      '2. 담당자별 할 일을 메일 초안으로 씁니다.',
      '## 결과물',
      '요약 문서',
    ].join('\n');
    renderDetail({
      ...weekly,
      marketProfile: { ...weekly.marketProfile, pipeline: '처리 방식 · 역할' },
    });

    const howBlock = screen.getByText('com_skills_how').parentElement as HTMLElement;
    expect(howBlock.querySelectorAll('li')).toHaveLength(2);
    expect(howBlock).toHaveTextContent('결정 사항을 추립니다.');
    expect(howBlock).toHaveTextContent('담당자별 할 일을 메일 초안으로 씁니다.');
    expect(howBlock).not.toHaveTextContent('회의 내용을 정리합니다.');
    expect(howBlock).not.toHaveTextContent('처리 방식 · 역할');
    expect(
      screen.getByText((text) => text.includes('com_skills_detail_model_auto')),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /내보내기/ })).not.toBeInTheDocument();
  });

  it('keeps the dialog fixed in the viewport', () => {
    renderDetail();

    // 공용 대화상자는 fixed 로 가운데에 놓인다. 뒤에 붙은 position 클래스가 그것을 덮으면 창이 화면 밖으로 밀린다.
    const panelClasses = screen.getByTestId('dialog-panel').className.split(/\s+/);
    expect(panelClasses).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^(relative|absolute|static|sticky)$/)]),
    );
  });

  it('blurs the background behind the detail window', () => {
    renderDetail();

    expect(screen.getByTestId('dialog-content')).toHaveClass(
      'bg-text-primary/40',
      'backdrop-blur-[6px]',
    );
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
