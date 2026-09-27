import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { TModelSpec, TSkill } from 'librechat-data-provider';
import type { SessionDeps } from '../useSession';
import type { TrialTransport } from '../trial';
import { SOURCE_ORIGIN, changedFields, forkState } from '../state';
import useSession from '../useSession';
import Builder from '../Builder';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
}));

const original = {
  _id: 'orig-1',
  name: 'trip-report',
  displayTitle: '출장보고 작성',
  description: '해외 출장 메모를 출장보고 양식으로 작성. 다음 요청에 사용: 출장, 출장보고.',
  body: '# 출장보고 작성\n\n1. 요청한 형식에 맞춰 작성한다.\n2. 환율은 출장일 기준으로 적는다.\n\n## 결과물\n- 형태: 보고서 문서\n',
  frontmatter: {
    title: '출장보고 작성',
    metadata: {
      output: 'report',
      icon: '✈️',
      triggers: ['출장', '출장보고'],
      fields: ['출장 목적', '주요 결과'],
      connectors: ['e-approval'],
    },
  },
  manualMinutes: 60,
  author: 'someone-else',
  authorName: '박지원',
  version: 4,
  source: 'user',
  fileCount: 0,
  createdAt: '',
  updatedAt: '',
} as unknown as TSkill;

const spec = {
  name: 'work-helper',
  label: '업무 도우미',
  preset: { endpoint: 'agents', agent_id: 'agent_default' },
} as TModelSpec;

function fakeServer() {
  let current: TSkill | undefined;
  const transport: TrialTransport = {
    start: jest.fn(async () => ({ streamId: 'stream-1', conversationId: 'convo-1' })),
    subscribe: jest.fn((_streamId, onMessage) => {
      setTimeout(() => {
        onMessage({
          final: true,
          conversation: { conversationId: 'convo-1' },
          responseMessage: {},
        });
      }, 0);
      return () => undefined;
    }),
  };
  const deps: SessionDeps = {
    requestDraft: jest.fn(),
    isRateLimited: () => false,
    createSkill: jest.fn(),
    forkSkill: jest.fn(async () => {
      current = {
        ...original,
        _id: 'copy-1',
        name: 'trip-report-fork',
        forkOf: 'orig-1',
        version: 1,
      };
      return current;
    }),
    updateSkill: jest.fn(async ({ payload }) => {
      current = {
        ...(current as TSkill),
        ...(payload as Partial<TSkill>),
        version: (current as TSkill).version + 1,
      };
      return current;
    }),
    recordTest: jest.fn(async ({ payload }) => {
      current = {
        ...(current as TSkill),
        lastTest: { version: payload.version, seconds: 30, conversationId: 'convo-1', at: '' },
      };
      return current;
    }),
    publish: jest.fn(async () => ({ ...(current as TSkill), publishedAt: '2026-09-27' })),
    transport,
    spec,
    wait: async () => undefined,
  };
  return deps;
}

function Harness({ deps }: { deps: SessionDeps }) {
  const session = useSession(deps, {
    fork: { id: original._id, state: forkState(original, '교류협력팀') },
  });
  return (
    <Builder
      session={session}
      author="홍길동"
      forkTitle="출장보고 작성"
      onCancel={jest.fn()}
      onPublish={() => void session.publishSkill()}
    />
  );
}

async function runTest(name = 'com_skills_builder_test_run') {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await jest.runAllTimersAsync();
  });
}

describe('forkState', () => {
  it('fills the text and every field from the original and marks them as unchanged', () => {
    const state = forkState(original, '교류협력팀');
    expect(state.direct).toBe(true);
    expect(state.textBy).toBe(SOURCE_ORIGIN);
    expect(state.text).toBe('요청한 형식에 맞춰 작성한다.\n환율은 출장일 기준으로 적는다.');
    expect(state.values).toEqual({
      title: '출장보고 작성 (교류협력팀)',
      description: '해외 출장 메모를 출장보고 양식으로 작성.',
      triggers: ['출장', '출장보고'],
      output: 'report',
      fields: ['출장 목적', '주요 결과'],
      icon: '✈️',
      extras: [],
      connectors: ['e-approval'],
    });
    expect(state.manualMinutes).toBe(60);
    expect(state.scope).toBe('all');
    expect(Object.values(state.sources).every((source) => source === SOURCE_ORIGIN)).toBe(true);
  });

  it('restores the publication scope from the loaded skill response', () => {
    expect(forkState({ ...original, scope: 'team' }).scope).toBe('team');
    expect(forkState({ ...original, scope: 'me' }).scope).toBe('me');
  });

  it('uses the saved text of a direct-mode original as is', () => {
    const state = forkState({
      ...original,
      builder: { text: '한 줄\n두 줄', direct: true, sources: {}, aiOff: [] },
    });
    expect(state.text).toBe('한 줄\n두 줄');
    expect(state.values.title).toBe('출장보고 작성');
  });

  it('reports only the fields that differ from the original', () => {
    const orig = forkState(original);
    expect(changedFields(orig, orig).size).toBe(0);
    const edited = {
      ...orig,
      text: `${orig.text}\n합계는 맨 위에 둔다.`,
      values: { ...orig.values, connectors: [] },
    };
    expect([...changedFields(edited, orig)].sort()).toEqual(['connectors', 'text']);
  });
});

describe('Builder in adapt mode', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('opens with the original filled in, a reshare button and no change marks', () => {
    const deps = fakeServer();
    render(<Harness deps={deps} />);

    expect(
      screen.getByText('com_skills_builder_fork_title:{"name":"출장보고 작성"}'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('com_skills_builder_how')).toHaveValue(
      '요청한 형식에 맞춰 작성한다.\n환율은 출장일 기준으로 적는다.',
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      '출장보고 작성 (교류협력팀)',
    );
    expect(screen.getAllByText('com_skills_builder_source_origin').length).toBeGreaterThan(0);
    expect(screen.queryByText('com_skills_builder_changed')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'com_skills_builder_republish' }),
    ).toBeInTheDocument();
    expect(deps.requestDraft).not.toHaveBeenCalled();
  });

  it('marks the text as changed from the original once it is edited', () => {
    const deps = fakeServer();
    render(<Harness deps={deps} />);
    const textbox = screen.getByLabelText('com_skills_builder_how');
    fireEvent.change(textbox, {
      target: { value: '요청한 형식에 맞춰 작성한다.\n합계는 맨 위에 둔다.' },
    });

    const section = textbox.closest('section') as HTMLElement;
    expect(within(section).getByText('com_skills_builder_changed')).toBeInTheDocument();
  });

  it('marks a connector switched off as changed from the original', () => {
    const deps = fakeServer();
    render(<Harness deps={deps} />);
    fireEvent.click(screen.getByRole('switch', { name: 'e-approval' }));
    expect(screen.getByText('com_skills_builder_changed')).toBeInTheDocument();
  });

  it('copies the original on the first test only and saves the editor content onto the copy', async () => {
    const deps = fakeServer();
    render(<Harness deps={deps} />);
    await runTest();

    expect(deps.forkSkill).toHaveBeenCalledTimes(1);
    expect(deps.forkSkill).toHaveBeenCalledWith({ id: 'orig-1' });
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(deps.updateSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'copy-1',
        expectedVersion: 1,
        payload: expect.objectContaining({
          displayTitle: '출장보고 작성 (교류협력팀)',
          manualMinutes: 60,
        }),
      }),
    );
    expect(deps.transport.start).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ manualSkills: ['trip-report-fork'] }),
    );
    expect(screen.getByText('com_skills_builder_test_passed')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('com_skills_builder_how'), {
      target: { value: '요청한 형식에 맞춰 작성한다.' },
    });
    await runTest();
    expect(deps.forkSkill).toHaveBeenCalledTimes(1);
    expect(deps.updateSkill).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'copy-1', expectedVersion: 2 }),
    );
  });

  it('does not copy the original again when saving onto the copy failed', async () => {
    const deps = fakeServer();
    (deps.updateSkill as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    render(<Harness deps={deps} />);
    await runTest();
    expect(screen.getByText('com_skills_builder_save_failed')).toBeInTheDocument();

    await runTest();
    expect(deps.forkSkill).toHaveBeenCalledTimes(1);
    expect(deps.updateSkill).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'copy-1', expectedVersion: 1 }),
    );
  });
});
