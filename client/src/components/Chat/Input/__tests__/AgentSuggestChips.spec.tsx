/**
 * @jest-environment-options {"url": "http://localhost:9"}
 */
import React from 'react';
import '@testing-library/jest-dom';
import { useSetAtom } from 'jotai';
import userEvent from '@testing-library/user-event';
import { QueryKeys } from 'librechat-data-provider';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecoilRoot, useRecoilValue, type MutableSnapshot } from 'recoil';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { TSkillSummary } from 'librechat-data-provider';
import type { TAuthContext } from '~/common';
import AgentSuggestChips, {
  builderEntryByConvoId,
  matchSuggestedSkills,
  readAgentBuildRequest,
} from '../AgentSuggestChips';
import { AuthContext } from '~/hooks/AuthContext';
import store from '~/store';

const CONVO_ID = 'convo-1';

function skill(
  name: string,
  overrides: Partial<TSkillSummary> & { triggers?: string[]; kind?: string } = {},
): TSkillSummary {
  const { triggers, kind, ...rest } = overrides;
  return {
    _id: `id-${name}`,
    name,
    description: name,
    author: 'author-1',
    authorName: 'Author',
    version: 1,
    source: 'inline',
    fileCount: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    marketProfile: { triggers, kind },
    ...rest,
  } as TSkillSummary;
}

describe('readAgentBuildRequest', () => {
  it('removes the "agent 만들어줘" tail from a build request', () => {
    expect(readAgentBuildRequest('보고서 쓰는 agent 만들어줘')).toBe('보고서 쓰는');
  });

  it('removes a polite tail with an object particle', () => {
    expect(readAgentBuildRequest('회의록을 정리해주는 에이전트를 하나 생성해 주세요.')).toBe(
      '회의록을 정리',
    );
  });

  it('keeps the whole sentence when the request continues after the verb', () => {
    expect(readAgentBuildRequest('agent 만들어서 매주 돌려줘')).toBe('agent 만들어서 매주 돌려줘');
  });

  it('does not treat a how-to question as a build request', () => {
    expect(readAgentBuildRequest('agent 만드는 법 알려줘')).toBeNull();
  });

  it('does not treat an ordinary request as a build request', () => {
    expect(readAgentBuildRequest('이번 주 회의록 요약해줘')).toBeNull();
  });
});

describe('matchSuggestedSkills', () => {
  const always = () => true;

  it('picks agents whose trigger appears in the text, most used first, at most three', () => {
    const skills = [
      skill('a', { triggers: ['회의록'], useCount: 1 }),
      skill('b', { triggers: ['요약'], useCount: 9 }),
      skill('c', { triggers: ['번역'], useCount: 50 }),
      skill('d', { triggers: ['회의록'], useCount: 5 }),
      skill('e', { triggers: ['주간'], useCount: 3 }),
    ];

    const names = matchSuggestedSkills(skills, '이번 주간 회의록 요약해줘', always).map(
      (s) => s.name,
    );

    expect(names).toEqual(['b', 'd', 'e']);
  });

  it('skips agents that are switched off', () => {
    const skills = [skill('on', { triggers: ['요약'] }), skill('off', { triggers: ['요약'] })];

    const names = matchSuggestedSkills(skills, '요약해줘', (s) => s.name === 'on').map(
      (s) => s.name,
    );

    expect(names).toEqual(['on']);
  });

  it('skips base agents and agents that cannot be picked by hand', () => {
    const skills = [
      skill('base', { triggers: ['요약'], kind: '기본' }),
      skill('model-only', { triggers: ['요약'], userInvocable: false }),
      skill('shared', { triggers: ['요약'], kind: '공유' }),
    ];

    expect(matchSuggestedSkills(skills, '요약해줘', always).map((s) => s.name)).toEqual(['shared']);
  });

  it('suggests nothing for empty text', () => {
    expect(matchSuggestedSkills([skill('a', { triggers: ['요약'] })], '  ', always)).toEqual([]);
  });
});

const auth = {
  isAuthenticated: true,
  user: { id: 'user-1', role: 'USER' },
  roles: {},
} as unknown as TAuthContext;

function PendingProbe() {
  const pending = useRecoilValue(store.pendingManualSkillsByConvoId(CONVO_ID));
  return <output data-testid="pending">{pending.join(',')}</output>;
}

function EditorProbe() {
  const location = useLocation();
  return <pre data-testid="editor-state">{JSON.stringify(location.state)}</pre>;
}

function SeedEntry() {
  const setEntry = useSetAtom(builderEntryByConvoId(CONVO_ID));
  return (
    <button
      type="button"
      data-testid="seed-entry"
      onClick={() => setEntry({ text: '보고서 쓰는', from: 'chat', conversationId: CONVO_ID })}
    />
  );
}

function renderChips({
  text,
  skills,
  pending = [],
}: {
  text: string;
  skills: TSkillSummary[];
  pending?: string[];
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData([QueryKeys.skills, 'infinite', '', '', 50], {
    pages: [{ skills, has_more: false }],
    pageParams: [undefined],
  });
  queryClient.setQueryData([QueryKeys.skillStates], {});
  queryClient.setQueryData([QueryKeys.startupConfig], {});
  const initializeState = ({ set }: MutableSnapshot) =>
    set(store.pendingManualSkillsByConvoId(CONVO_ID), pending);

  return render(
    <QueryClientProvider client={queryClient}>
      <RecoilRoot initializeState={initializeState}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={['/c/convo-1']}>
            <Routes>
              <Route
                path="/c/:conversationId"
                element={
                  <>
                    <SeedEntry />
                    <AgentSuggestChips conversationId={CONVO_ID} text={text} suggestEnabled />
                    <PendingProbe />
                  </>
                }
              />
              <Route path="/skills/new" element={<EditorProbe />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </RecoilRoot>
    </QueryClientProvider>,
  );
}

describe('AgentSuggestChips', () => {
  const skills = [
    skill('minutes', {
      displayTitle: '회의록 정리',
      triggers: ['회의록'],
      useCount: 4,
      source: 'deployment',
    }),
    skill('translate', {
      displayTitle: '번역',
      triggers: ['번역'],
      useCount: 8,
      source: 'deployment',
    }),
  ];

  it('suggests the agent whose trigger the typed text contains', async () => {
    renderChips({ text: '회의록 정리해줘', skills });

    const chips = await screen.findByTestId('agent-suggest-chips');
    expect(chips).toHaveTextContent('회의록 정리');
    expect(chips).not.toHaveTextContent('번역');
  });

  it('queues the picked agent for the next message and hides the chips', async () => {
    const user = userEvent.setup();
    renderChips({ text: '회의록 정리해줘', skills });

    await user.click(await screen.findByRole('button', { name: /회의록 정리/ }));

    expect(screen.getByTestId('pending')).toHaveTextContent('minutes');
    await waitFor(() => expect(screen.queryByTestId('agent-suggest-chips')).toBeNull());
  });

  it('shows no chips once an agent is already picked', async () => {
    renderChips({ text: '회의록 정리해줘', skills, pending: ['translate'] });

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByTestId('agent-suggest-chips')).toBeNull();
  });

  it('shows no chips when nothing matches', async () => {
    renderChips({ text: '날씨 알려줘', skills });

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByTestId('agent-suggest-chips')).toBeNull();
  });

  it('reopens the editor with the same request from the notice left in the chat', async () => {
    const user = userEvent.setup();
    renderChips({ text: '', skills });

    await user.click(screen.getByTestId('seed-entry'));
    const notice = screen.getByTestId('agent-editor-notice');
    await user.click(notice.querySelector('button') as HTMLButtonElement);

    expect(JSON.parse(screen.getByTestId('editor-state').textContent ?? 'null')).toEqual({
      text: '보고서 쓰는',
      from: 'chat',
      conversationId: CONVO_ID,
    });
  });
});
