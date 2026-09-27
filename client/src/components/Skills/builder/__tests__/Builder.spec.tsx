import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { TModelSpec, TSkill, TSkillDraft } from 'librechat-data-provider';
import type { SessionDeps } from '../useSession';
import type { TrialTransport } from '../trial';
import { DRAFT_DEBOUNCE_MS } from '../useDraft';
import useSession from '../useSession';
import Builder from '../Builder';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
}));

const draft: TSkillDraft = {
  slug: 'trip-report',
  title: '출장보고 작성',
  description: '해외 출장 메모를 출장보고 양식으로 작성',
  triggers: ['출장'],
  output: 'report',
  extras: [],
  fields: ['출장 목적'],
  icon: '✈️',
  steps: ['요청한 형식에 맞춰 작성한다.'],
  connectors: [],
  fileKinds: [],
  origin: 'rules',
};

const spec = {
  name: 'work-helper',
  label: '업무 도우미',
  preset: { endpoint: 'agents', agent_id: 'agent_default' },
} as TModelSpec;

/** 서버 규칙을 흉내 내는 대역: 내용 PATCH 는 버전을 올리고, 시험 기록·게시는 올리지 않는다. */
function fakeServer(publishedScope?: TSkill['scope']) {
  let current: TSkill | undefined;
  const bump = (patch: Partial<TSkill>) => {
    current = { ...(current as TSkill), ...patch, version: (current as TSkill).version + 1 };
    return current;
  };
  const transport: TrialTransport = {
    start: jest.fn(async () => ({ streamId: 'stream-1', conversationId: 'convo-1' })),
    subscribe: jest.fn((_streamId, onMessage) => {
      setTimeout(() => {
        onMessage({
          event: 'on_message_delta',
          data: { delta: { content: [{ type: 'text', text: '결과' }] } },
        });
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
    requestDraft: jest.fn(async () => draft),
    isRateLimited: () => false,
    createSkill: jest.fn(async (payload) => {
      current = { ...(payload as unknown as TSkill), _id: 'skill-1', version: 1 };
      return current;
    }),
    updateSkill: jest.fn(async ({ payload }) => bump(payload as Partial<TSkill>)),
    recordTest: jest.fn(async ({ payload }) => {
      current = {
        ...(current as TSkill),
        lastTest: {
          version: payload.version,
          seconds: 42,
          conversationId: payload.conversationId,
          at: '',
        },
      };
      return current;
    }),
    publish: jest.fn(async ({ payload }) => ({
      ...(current as TSkill),
      publishedAt: '2026-09-27',
      scope: publishedScope ?? payload.scope,
    })),
    transport,
    spec,
    wait: async () => undefined,
  };
  return { deps };
}

function Harness({ deps, onPublish }: { deps: SessionDeps; onPublish?: () => void }) {
  const session = useSession(deps);
  return (
    <Builder
      session={session}
      author="홍길동"
      onCancel={jest.fn()}
      onPublish={() => {
        void session.publishSkill();
        onPublish?.();
      }}
    />
  );
}

const publishButton = () => screen.getByRole('button', { name: 'com_skills_builder_publish' });
const todo = (key: string) => screen.getByText(`com_skills_builder_todo_${key}`).closest('li');

async function typeText(text: string) {
  fireEvent.change(screen.getByLabelText('com_skills_builder_text_heading'), {
    target: { value: text },
  });
  await act(async () => {
    jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
  });
}

async function passTest() {
  fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_test_run' }));
  await act(async () => {
    await jest.runAllTimersAsync();
  });
}

describe('Builder', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps publish disabled and lists the unmet conditions until all are met', async () => {
    const { deps } = fakeServer();
    render(<Harness deps={deps} />);

    expect(publishButton()).toBeDisabled();
    expect(todo('text')).toHaveAttribute('data-done', 'false');
    expect(todo('minutes')).toHaveAttribute('data-done', 'false');
    expect(todo('test')).toHaveAttribute('data-done', 'false');

    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');
    expect(todo('text')).toHaveAttribute('data-done', 'true');
    expect(publishButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_minutes_30' }));
    expect(todo('minutes')).toHaveAttribute('data-done', 'true');
    expect(publishButton()).toBeDisabled();

    await passTest();
    expect(todo('test')).toHaveAttribute('data-done', 'true');
    expect(publishButton()).toBeEnabled();
  });

  it('shows the AI-filled name and does not overwrite a name the person edited', async () => {
    const { deps } = fakeServer();
    render(<Harness deps={deps} />);
    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');

    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveTextContent('출장보고 작성');
    expect(
      within(heading.parentElement as HTMLElement).getByText('com_skills_builder_source_ai'),
    ).toBeInTheDocument();

    fireEvent.click(within(heading).getByRole('button'));
    fireEvent.change(screen.getByLabelText('com_skills_builder_name_placeholder'), {
      target: { value: '우리 팀 출장보고' },
    });
    fireEvent.blur(screen.getByLabelText('com_skills_builder_name_placeholder'));

    (deps.requestDraft as jest.Mock).mockResolvedValue({ ...draft, title: '회의록 정리' });
    await typeText('회의록을 정리한다.');

    expect(deps.requestDraft).toHaveBeenCalledTimes(2);
    const edited = screen.getByRole('heading', { level: 3 });
    expect(edited).toHaveTextContent('우리 팀 출장보고');
    expect(
      within(edited.parentElement as HTMLElement).getByText('com_skills_builder_source_me'),
    ).toBeInTheDocument();
  });

  it('runs the test as a temporary conversation and records it for the saved version', async () => {
    const { deps } = fakeServer();
    render(<Harness deps={deps} />);
    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_minutes_30' }));
    await passTest();

    expect(deps.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'trip-report', displayTitle: '출장보고 작성' }),
    );
    expect(deps.updateSkill).toHaveBeenCalledWith({
      id: 'skill-1',
      expectedVersion: 1,
      payload: { manualMinutes: 30 },
    });
    expect(deps.transport.start).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        isTemporary: true,
        manualSkills: ['trip-report'],
        text: '출장 시작해줘',
      }),
    );
    expect(deps.recordTest).toHaveBeenCalledWith({
      id: 'skill-1',
      payload: { conversationId: 'convo-1', version: 2 },
    });
    expect(screen.getByText('com_skills_builder_test_passed')).toBeInTheDocument();
    expect(screen.getByText('결과')).toBeInTheDocument();
  });

  it('drops the passed test when the content changes after testing', async () => {
    const { deps } = fakeServer();
    render(<Harness deps={deps} />);
    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_minutes_30' }));
    await passTest();
    expect(publishButton()).toBeEnabled();

    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.\n환율은 출장일 기준으로 적는다.');

    expect(todo('test')).toHaveAttribute('data-done', 'false');
    expect(publishButton()).toBeDisabled();
    expect(screen.queryByText('com_skills_builder_test_passed')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_test_run' }));
      await jest.runAllTimersAsync();
    });
    expect(deps.updateSkill).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'skill-1', expectedVersion: 2 }),
    );
    expect(deps.recordTest).toHaveBeenLastCalledWith({
      id: 'skill-1',
      payload: { conversationId: 'convo-1', version: 3 },
    });
    expect(publishButton()).toBeEnabled();
  });

  it('publishes to all departments by default and to only me when chosen', async () => {
    const { deps } = fakeServer();
    render(<Harness deps={deps} />);
    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_minutes_30' }));
    await passTest();

    expect(screen.getByRole('radio', { name: 'com_skills_scope_all' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'com_skills_builder_scope_me' }));
    await act(async () => {
      fireEvent.click(publishButton());
    });

    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(deps.publish).toHaveBeenCalledWith({ id: 'skill-1', payload: { scope: 'me' } });
  });

  it('offers the team scope and publishes it as team', async () => {
    const { deps } = fakeServer();
    render(<Harness deps={deps} />);
    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_minutes_30' }));
    await passTest();

    fireEvent.click(screen.getByRole('radio', { name: 'com_skills_scope_team' }));
    expect(screen.getByRole('radio', { name: 'com_skills_scope_team' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await act(async () => {
      fireEvent.click(publishButton());
    });

    expect(deps.publish).toHaveBeenCalledWith({ id: 'skill-1', payload: { scope: 'team' } });
  });

  it('restores the scope from the published skill response', async () => {
    const { deps } = fakeServer('me');
    render(<Harness deps={deps} />);
    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_minutes_30' }));
    await passTest();
    fireEvent.click(screen.getByRole('radio', { name: 'com_skills_scope_team' }));

    await act(async () => {
      fireEvent.click(publishButton());
    });

    expect(screen.getByRole('radio', { name: 'com_skills_builder_scope_me' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('switches the SKILL.md view between the readable card and the raw text', async () => {
    const { deps } = fakeServer();
    render(<Harness deps={deps} />);
    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');

    expect(screen.queryByTestId('builder-raw')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'com_skills_builder_view_raw' }));
    expect(screen.getByTestId('builder-raw')).toHaveTextContent('name: trip-report');
    expect(screen.getByTestId('builder-raw')).toHaveTextContent('1. 요청한 형식에 맞춰 작성한다.');
  });

  it('shows why the test failed when no default agent is configured', async () => {
    const { deps } = fakeServer();
    render(<Harness deps={{ ...deps, spec: null }} />);
    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');
    await passTest();

    expect(screen.getByRole('alert')).toHaveTextContent('com_skills_builder_test_no_agent');
    expect(todo('test')).toHaveAttribute('data-done', 'false');
  });
});
