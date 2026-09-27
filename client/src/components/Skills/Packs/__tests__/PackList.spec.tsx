import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { riskCheck, weekly } from '../../Marketplace/__fixtures__/skills';
import PackList from '../PackList';

const mockSkills = [weekly, riskCheck];
const mockPacks = [
  {
    _id: 'pack-1',
    name: '월말 팩',
    slug: 'month-end',
    description: '월말에 쓰는 묶음',
    author: 'user-1',
    authorName: '박지원',
    createdAt: '',
    updatedAt: '',
    skillIds: [weekly._id, riskCheck._id, 'unavailable-skill'],
  },
];
const mockConnectors: Record<string, string[]> = {
  [weekly._id]: ['e-approval', 'mail'],
  [riskCheck._id]: ['mail', 'jira'],
};

jest.mock('@librechat/client', () => ({
  Spinner: () => <div data-testid="spinner" />,
}));
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
}));
jest.mock('~/data-provider', () => ({
  useListSkillPacksQuery: () => ({ data: mockPacks, isLoading: false, isError: false }),
  useSkillsInfiniteQuery: () => ({ data: { pages: [{ skills: mockSkills }] } }),
  useGetSkillQuery: (id: string) => ({
    data: { _id: id, frontmatter: { metadata: { connectors: mockConnectors[id] ?? [] } } },
  }),
}));

describe('PackList', () => {
  it('shows the create action with a large brand-colored circle', () => {
    render(<PackList onOpen={jest.fn()} onCreate={jest.fn()} />);

    const createButton = screen.getByRole('button', { name: /com_skills_pack_create/ });
    expect(createButton).toHaveClass('items-center');
    expect(within(createButton).getByText('＋')).toHaveClass(
      'size-[68px]',
      'bg-surface-brand-subtle',
      'text-accent-primary',
      'text-[34px]',
    );
  });

  it('uses the shared large radius for pack cards', () => {
    render(<PackList onOpen={jest.fn()} onCreate={jest.fn()} />);

    expect(screen.getByRole('button', { name: /월말 팩/ })).toHaveClass('rounded-3xl');
  });

  it('uses the shared large radius for the create-pack card', () => {
    render(<PackList onOpen={jest.fn()} onCreate={jest.fn()} />);

    expect(screen.getByRole('button', { name: /com_skills_pack_create/ })).toHaveClass(
      'rounded-3xl',
    );
  });

  it('shows stats for the included skills available to the user', async () => {
    render(<PackList onOpen={jest.fn()} onCreate={jest.fn()} />);

    const card = screen.getByRole('button', { name: /월말 팩/ });
    const totalRuns = (weekly.useCount ?? 0) + (riskCheck.useCount ?? 0);

    await waitFor(() =>
      expect(card).toHaveTextContent(
        `2 com_skills_pack_agent_count · com_skills_pack_total_runs ${totalRuns.toLocaleString('ko-KR')} · com_skills_pack_mcp_servers e-approval, mail, jira`,
      ),
    );
  });
});
