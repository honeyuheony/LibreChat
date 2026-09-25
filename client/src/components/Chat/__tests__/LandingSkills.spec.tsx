import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Constants } from 'librechat-data-provider';
import type { TSkillSummary } from 'librechat-data-provider';
import LandingSkills, { resolveSuggestableSkillIds } from '../LandingSkills';
import store, { ephemeralAgentByConvoId } from '~/store';

let mockSkills: Partial<TSkillSummary>[] = [];
let mockAgentsMap: Record<string, unknown> | undefined;

jest.mock('~/data-provider', () => ({
  useSkillsInfiniteQuery: () => ({ data: { pages: [{ skills: mockSkills }] } }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useSkillActiveState: () => ({
    isActive: (skill: { _id: string }) => skill._id !== 'inactive',
  }),
}));

jest.mock('~/Providers', () => ({
  useAgentsMapContext: () => mockAgentsMap,
}));

const skill = (id: string, extra: Partial<TSkillSummary> = {}): Partial<TSkillSummary> => ({
  _id: id,
  name: `${id}-name`,
  displayTitle: `${id} title`,
  ...extra,
});

function QueueProbe({ conversationId }: { conversationId: string }) {
  const pending = useRecoilValue(store.pendingManualSkillsByConvoId(conversationId));
  const ephemeral = useRecoilValue(ephemeralAgentByConvoId(conversationId));
  return (
    <output data-testid="probe">
      {JSON.stringify({ pending, skills: ephemeral?.skills ?? null })}
    </output>
  );
}

function renderSkills(agentId?: string) {
  const conversationId = Constants.NEW_CONVO as string;
  return render(
    <RecoilRoot>
      <LandingSkills conversationId={conversationId} agentId={agentId} />
      <QueueProbe conversationId={conversationId} />
    </RecoilRoot>,
  );
}

describe('LandingSkills', () => {
  beforeEach(() => {
    mockAgentsMap = undefined;
    mockSkills = [
      skill('a'),
      skill('inactive'),
      skill('model-only', { userInvocable: false }),
      skill('b'),
      skill('c'),
      skill('d'),
      skill('e'),
    ];
  });

  it('suggests the first four skills the user can run by hand', () => {
    renderSkills();
    const labels = screen.getAllByRole('button').map((button) => button.textContent);
    expect(labels).toEqual(['a title', 'b title', 'c title', 'd title']);
  });

  it('queues the clicked skill for the next message, as the $ popover does', () => {
    renderSkills();
    fireEvent.click(screen.getByRole('button', { name: 'b title' }));
    expect(JSON.parse(screen.getByTestId('probe').textContent ?? '')).toEqual({
      pending: ['b-name'],
      skills: true,
    });
  });

  it('does not queue the same skill twice', () => {
    renderSkills();
    fireEvent.click(screen.getByRole('button', { name: 'a title' }));
    fireEvent.click(screen.getByRole('button', { name: 'a title' }));
    expect(JSON.parse(screen.getByTestId('probe').textContent ?? '').pending).toEqual(['a-name']);
  });

  it('suggests only the skills the selected agent is scoped to', () => {
    mockAgentsMap = { agent_1: { skills_enabled: true, skills: ['c', 'e'] } };
    renderSkills('agent_1');
    const labels = screen.getAllByRole('button').map((button) => button.textContent);
    expect(labels).toEqual(['c title', 'e title']);
  });

  it('renders nothing when the selected agent cannot run skills', () => {
    mockAgentsMap = { agent_1: { skills_enabled: false } };
    renderSkills('agent_1');
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });
});

describe('resolveSuggestableSkillIds', () => {
  it('leaves an ephemeral conversation unrestricted', () => {
    expect(resolveSuggestableSkillIds(Constants.EPHEMERAL_AGENT_ID, undefined)).toBeUndefined();
  });

  it('allows nothing while the agent map has not loaded', () => {
    expect(resolveSuggestableSkillIds('agent_1', undefined)).toEqual([]);
  });

  it('leaves an agent with every skill in scope unrestricted', () => {
    const agentsMap = { agent_1: { skills_enabled: true, skills: [] } };
    expect(resolveSuggestableSkillIds('agent_1', agentsMap)).toBeUndefined();
  });
});
