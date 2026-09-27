import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  CURRENT_USER_ID,
  baseReport,
  myDraft,
  riskCheck,
  weekly,
} from '../../Marketplace/__fixtures__/skills';
import PackCreate from '../PackCreate';

const mockCreate = jest.fn();
const mockShowToast = jest.fn();
const mockConnectors: Record<string, string[]> = {
  [weekly._id]: ['e-approval', 'mail'],
  [riskCheck._id]: ['mail', 'jira'],
};

jest.mock('@librechat/client', () => ({
  OGDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  OGDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useToastContext: () => ({ showToast: mockShowToast }),
}));
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
}));
jest.mock('~/data-provider', () => ({
  useCreateSkillPackMutation: () => ({ mutateAsync: mockCreate, isLoading: false }),
  useGetSkillQuery: (id: string) => ({
    data: { _id: id, frontmatter: { metadata: { connectors: mockConnectors[id] ?? [] } } },
  }),
}));

const SKILLS = [baseReport, weekly, riskCheck, myDraft];

function renderCreate(onClose = jest.fn()) {
  render(<PackCreate skills={SKILLS} userId={CURRENT_USER_ID} onClose={onClose} />);
  return onClose;
}

const publishButton = () => screen.getByRole('button', { name: 'com_skills_pack_publish' });
const pick = (title: string) =>
  fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(title) }));
const typeName = (name: string) =>
  fireEvent.change(screen.getByLabelText('com_skills_pack_name_placeholder'), {
    target: { value: name },
  });

describe('PackCreate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists staff agents only, mine first', () => {
    renderCreate();
    const names = screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'));
    expect(names).toEqual([myDraft.displayTitle, weekly.displayTitle, riskCheck.displayTitle]);
  });

  it('keeps publish disabled until two agents and a name are chosen', () => {
    renderCreate();
    typeName('월말 팩');
    pick(weekly.displayTitle as string);
    expect(publishButton()).toBeDisabled();
    expect(screen.getByText('com_skills_pack_min_agents')).toBeInTheDocument();

    pick(riskCheck.displayTitle as string);
    expect(publishButton()).toBeEnabled();

    typeName('   ');
    expect(publishButton()).toBeDisabled();
  });

  it('shows the union of MCP servers declared by the picked agents', () => {
    renderCreate();
    pick(weekly.displayTitle as string);
    pick(riskCheck.displayTitle as string);
    expect(
      screen.getByText('com_skills_pack_mcp_union:{"servers":"e-approval, mail, jira"}'),
    ).toBeInTheDocument();
    expect(screen.getByText(`${weekly.name}/`)).toBeInTheDocument();
    expect(screen.getByText('.mcp.json')).toBeInTheDocument();
  });

  it('publishes the pack with the picked agent ids and closes', async () => {
    mockCreate.mockResolvedValue({ _id: 'pack-1' });
    const onClose = renderCreate();
    typeName(' 월말 팩 ');
    fireEvent.change(screen.getByLabelText('com_skills_pack_desc_placeholder'), {
      target: { value: '월말에 쓰는 묶음' },
    });
    pick(weekly.displayTitle as string);
    pick(riskCheck.displayTitle as string);
    await act(async () => {
      fireEvent.click(publishButton());
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      name: '월말 팩',
      description: '월말에 쓰는 묶음',
      skillIds: [weekly._id, riskCheck._id],
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open and reports the failure when publishing fails', async () => {
    mockCreate.mockRejectedValue(new Error('boom'));
    const onClose = renderCreate();
    typeName('월말 팩');
    pick(weekly.displayTitle as string);
    pick(riskCheck.displayTitle as string);
    await act(async () => {
      fireEvent.click(publishButton());
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      message: 'com_skills_pack_create_failed',
    });
  });
});
