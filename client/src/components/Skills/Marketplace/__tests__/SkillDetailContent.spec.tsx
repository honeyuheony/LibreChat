import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ALL_SKILLS, weekly, weeklyFork } from '../__fixtures__/skills';
import SkillDetailContent from '../SkillDetailContent';

const mockNavigate = jest.fn();
const mockToggle = jest.fn();
const mockMutate = jest.fn();
const mockSetPendingSkills = jest.fn();
let mockForkOptions: { onSuccess?: (skill: { _id: string; name: string }) => void } = {};

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
  useToastContext: () => ({ showToast: jest.fn() }),
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
  useForkSkillMutation: (options: typeof mockForkOptions) => {
    mockForkOptions = options;
    return { mutate: mockMutate, isLoading: false };
  },
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

  it('shows triggers, output and the instructions without frontmatter', () => {
    renderDetail();
    expect(screen.getByText('주간보고')).toBeInTheDocument();
    expect(screen.getByText('HWP 문서')).toBeInTheDocument();
    expect(screen.getByTestId('instructions')).toHaveTextContent(/^1\. 양식을 따른다\.$/);
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

  it('forks the skill and opens the copy in the editor', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_fork' }));
    expect(mockMutate).toHaveBeenCalledWith({ id: weekly._id });
    mockForkOptions.onSuccess?.({ _id: 'copy-1', name: 'weekly-report-fork' });
    expect(mockNavigate).toHaveBeenCalledWith('/skills/copy-1/edit');
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
