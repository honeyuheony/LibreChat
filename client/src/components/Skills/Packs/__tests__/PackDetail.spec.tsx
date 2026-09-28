import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { TSkillPack } from 'librechat-data-provider';
import {
  CURRENT_USER_ID,
  myDraft,
  riskCheck as deployedRiskCheck,
  weekly as deployedWeekly,
} from '../../Marketplace/__fixtures__/skills';
import PackDetail from '../PackDetail';

const mockUpdateStates = jest.fn();
const mockDelete = jest.fn();
const mockShowToast = jest.fn();
/** 배포 스킬은 늘 켜진 것으로 보므로, 끌 수 있는 공유 스킬로 바꿔 쓴다. */
const weekly = { ...deployedWeekly, source: 'inline' as const };
const riskCheck = { ...deployedRiskCheck, source: 'inline' as const };
let mockPack: TSkillPack;
let mockStates: Record<string, boolean>;
const mockConnectors: Record<string, string[]> = {
  [deployedWeekly._id]: ['e-approval'],
  [deployedRiskCheck._id]: ['e-approval', 'jira'],
};

jest.mock('@librechat/client', () => ({
  Spinner: () => <div data-testid="spinner" />,
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useToastContext: () => ({ showToast: mockShowToast }),
}));
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
  useSkillActiveState: () => ({
    skillStates: mockStates,
    defaultActiveOnShare: false,
    isActive: (skill: { _id: string; author: string; source: string }) =>
      mockStates[skill._id] ??
      jest
        .requireActual('~/hooks/Skills/useSkillActiveState')
        .resolveSkillDefaultActive(skill, 'user-hong', false),
    isLoading: false,
  }),
}));
jest.mock('~/data-provider', () => ({
  useGetSkillPackQuery: () => ({ data: mockPack, isLoading: false, isError: false }),
  useDeleteSkillPackMutation: () => ({ mutateAsync: mockDelete, isLoading: false }),
  useUpdateSkillStatesMutation: () => ({ mutateAsync: mockUpdateStates, isLoading: false }),
  useGetSkillQuery: (id: string) => ({
    data: { _id: id, frontmatter: { metadata: { connectors: mockConnectors[id] ?? [] } } },
  }),
}));

jest.mock(
  '../../Marketplace/ExportButton',
  () =>
    ({ kind, id, fileName }: Record<string, string>) => (
      <button type="button" data-testid="export">{`${kind}:${id}:${fileName}`}</button>
    ),
);

function renderDetail(onSelectSkill = jest.fn(), onDeleted = jest.fn()) {
  render(
    <PackDetail
      packId="pack-1"
      skills={[weekly, riskCheck, myDraft]}
      userId={CURRENT_USER_ID}
      onSelectSkill={onSelectSkill}
      onDeleted={onDeleted}
    />,
  );
  return { onSelectSkill, onDeleted };
}

const addAllButton = () => screen.getByRole('button', { name: 'com_skills_pack_add_all' });

describe('PackDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStates = {};
    mockPack = {
      _id: 'pack-1',
      name: '월말 팩',
      slug: 'month-end',
      description: '월말에 쓰는 묶음',
      author: 'someone-else',
      authorName: '박지원',
      createdAt: '',
      updatedAt: '',
      skillIds: [weekly._id, riskCheck._id, myDraft._id],
    };
  });

  it('shows the agent count, total runs and the MCP servers of the included agents', () => {
    renderDetail();
    const runs = (weekly.useCount ?? 0) + (riskCheck.useCount ?? 0) + (myDraft.useCount ?? 0);
    expect(screen.getByText('com_skills_pack_agent_count').parentElement).toHaveTextContent(
      /^3com_skills_pack_agent_count$/,
    );
    expect(screen.getByText('com_skills_pack_total_runs').parentElement).toHaveTextContent(
      new RegExp(`^${runs.toLocaleString('ko-KR')}com_skills_pack_total_runs$`),
    );
    expect(screen.getByText(/^com_skills_pack_mcp_servers/).parentElement).toHaveTextContent(
      /^2com_skills_pack_mcp_servers · e-approval, jira$/,
    );
  });

  it('turns on every included agent that is off, in one request', async () => {
    mockStates = { [myDraft._id]: false };
    renderDetail();
    await act(async () => {
      fireEvent.click(addAllButton());
    });

    expect(mockUpdateStates).toHaveBeenCalledTimes(1);
    expect(mockUpdateStates).toHaveBeenCalledWith({
      [weekly._id]: true,
      [riskCheck._id]: true,
    });
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'success',
      message: 'com_skills_pack_added_all',
    });
  });

  it('keeps overrides for agents outside the pack', async () => {
    mockStates = { other: false, [weekly._id]: true };
    renderDetail();
    await act(async () => {
      fireEvent.click(addAllButton());
    });
    expect(mockUpdateStates).toHaveBeenCalledWith({
      other: false,
      [weekly._id]: true,
      [riskCheck._id]: true,
    });
  });

  it('sends nothing when every agent is already on', async () => {
    mockStates = { [weekly._id]: true, [riskCheck._id]: true };
    renderDetail();
    await act(async () => {
      fireEvent.click(addAllButton());
    });
    expect(mockUpdateStates).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'success',
      message: 'com_skills_pack_added_all',
    });
  });

  it('opens an included agent', () => {
    const { onSelectSkill } = renderDetail();
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(riskCheck.displayTitle as string) }),
    );
    expect(onSelectSkill).toHaveBeenCalledWith(riskCheck);
  });

  it('offers the pack folder as a zip next to the add-all button', () => {
    renderDetail();
    const exportButton = screen.getByTestId('export');
    expect(exportButton).toHaveTextContent('pack:pack-1:month-end.zip');
    expect(exportButton.nextElementSibling).toBe(addAllButton());
  });

  it('lets only the author delete the pack', async () => {
    renderDetail();
    expect(screen.queryByRole('button', { name: 'com_skills_pack_delete' })).toBeNull();
  });

  it('deletes the pack for its author', async () => {
    mockPack = { ...mockPack, author: CURRENT_USER_ID };
    mockDelete.mockResolvedValue({ deleted: true });
    const { onDeleted } = renderDetail();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'com_skills_pack_delete' }));
    });
    expect(mockDelete).toHaveBeenCalledWith({ id: 'pack-1' });
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
});
