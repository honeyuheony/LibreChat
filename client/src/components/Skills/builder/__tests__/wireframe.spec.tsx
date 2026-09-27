import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { TSkill, TSkillDraft } from 'librechat-data-provider';
import type { SessionDeps } from '../useSession';
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
  connectors: ['confluence'],
  fileKinds: [],
  origin: 'rules',
};

const deps: SessionDeps = {
  requestDraft: jest.fn(async () => draft),
  isRateLimited: () => false,
  createSkill: jest.fn(async () => ({ _id: 'skill-1', version: 1 }) as TSkill),
  updateSkill: jest.fn(async () => ({ _id: 'skill-1', version: 2 }) as TSkill),
  recordTest: jest.fn(async () => ({ _id: 'skill-1', version: 2 }) as TSkill),
  publish: jest.fn(async () => ({ _id: 'skill-1', version: 2 }) as TSkill),
  transport: { start: jest.fn(), subscribe: jest.fn() },
  spec: null,
  wait: async () => undefined,
};

function Harness({ department }: { department?: string }) {
  const session = useSession(deps);
  return (
    <Builder
      session={session}
      author="홍길동"
      department={department}
      connectorChoices={['confluence', 'jira', 'mail']}
      onCancel={jest.fn()}
      onPublish={jest.fn()}
    />
  );
}

const textarea = () => screen.getByLabelText('com_skills_builder_text_heading');
const block = (title: string) => screen.getByText(title, { selector: 'h5' }).closest('section');

async function typeText(text: string) {
  fireEvent.change(textarea(), { target: { value: text } });
  await act(async () => {
    jest.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
  });
}

describe('Builder laid out like the wireframe editor', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('opens as a centered, rounded modal dialog titled with the editor name', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'com_skills_new_agent' });
    expect(dialog).toHaveClass('rounded-[22px]', 'max-w-[97vw]');
    expect(dialog.className).toContain('w-[1180px]');
  });

  it('offers to attach sample documents, says they are optional, and only explains an attachment', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /com_skills_builder_files_attach/ })).toBeVisible();
    expect(screen.getByText('com_skills_builder_files_hint')).toBeVisible();

    fireEvent.change(screen.getByTestId('builder-files'), {
      target: { files: [new File(['x'], '출장보고 양식.hwp')] },
    });
    expect(screen.getByRole('status')).toHaveTextContent('com_skills_builder_files_later');
    expect(screen.queryByText('출장보고 양식.hwp')).not.toBeInTheDocument();
  });

  it('opens and closes the note on how to start from someone else’s example', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_peek' }));
    expect(screen.getByText('com_skills_builder_peek_hint')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_peek_close' }));
    expect(screen.queryByText('com_skills_builder_peek_hint')).not.toBeInTheDocument();
  });

  it('keeps the AI-added badge on the same line as the end of its sentence', async () => {
    render(<Harness />);
    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');

    const tag = screen.getByText('com_skills_builder_source_added');
    const tail = tag.closest('[data-step-tail]');
    expect(tail).toHaveClass('whitespace-nowrap');
    expect(tail?.textContent?.startsWith('작성한다.')).toBe(true);
  });

  it('puts the readable/raw switch right after the file path with a filled selected pill', async () => {
    render(<Harness />);
    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');

    const path = screen.getByText('skills/trip-report/SKILL.md');
    const group = screen.getByRole('radiogroup', { name: 'com_skills_builder_view_mode' });
    expect(path.nextElementSibling).toBe(group);
    expect(path).not.toHaveClass('flex-1');
    const readable = within(group).getByRole('radio', { name: 'com_skills_builder_view_readable' });
    expect(readable).toHaveAttribute('aria-checked', 'true');
    expect(readable).toHaveClass('bg-surface-submit');
    expect(group).toHaveClass('rounded-full');

    fireEvent.keyDown(readable, { key: 'ArrowRight' });
    expect(
      within(group).getByRole('radio', { name: 'com_skills_builder_view_raw' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('builder-raw')).toBeInTheDocument();
  });

  it('shows the author with their department on the byline', () => {
    render(<Harness department="정세분석팀" />);
    expect(
      screen.getByText('com_skills_builder_by_dept:{"name":"홍길동","dept":"정세분석팀"}'),
    ).toBeVisible();
  });

  it('reads the chat text by default and reveals every internal system on request', async () => {
    render(<Harness />);
    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');

    const data = block('com_skills_builder_data') as HTMLElement;
    expect(within(data).getByText('com_skills_builder_data_chat')).toBeVisible();
    expect(within(data).getAllByRole('switch')).toHaveLength(1);

    fireEvent.click(
      within(data).getByRole('button', { name: 'com_skills_builder_connectors_more' }),
    );
    const names = within(data)
      .getAllByRole('switch')
      .map((item) => item.closest('label')?.textContent);
    expect(names).toEqual([
      expect.stringContaining('confluence'),
      expect.stringContaining('jira'),
      expect.stringContaining('mail'),
    ]);
    fireEvent.click(
      within(data).getByRole('button', { name: 'com_skills_builder_connectors_less' }),
    );
    expect(within(data).getAllByRole('switch')).toHaveLength(1);
  });

  it('marks editing with purple emphasis and shows the icon in a mint circle', async () => {
    render(<Harness />);
    expect(textarea().closest('section')).toHaveClass(
      'border-border-brand',
      'ring-surface-brand-subtle',
    );
    expect(textarea().className).toContain('focus:border-ring-primary');

    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');
    const icon = screen.getByRole('button', { name: 'com_skills_builder_icon_change' });
    expect(icon).toHaveClass('rounded-full', 'bg-status-success-subtle');
    expect(screen.getByRole('heading', { level: 3 })).toHaveClass('font-bold');
    const aiTag = within(block('com_skills_builder_when') as HTMLElement).getByText(
      'com_skills_builder_source_ai',
    );
    expect(aiTag).toHaveClass('text-accent-primary');
  });

  it('shows only the AI-set badge and the report label for the output while empty', () => {
    render(<Harness />);
    const output = block('com_skills_builder_output') as HTMLElement;
    expect(within(output).getByText('com_skills_builder_source_ai')).toBeVisible();
    expect(within(output).getByText('com_skills_builder_output_report')).toBeVisible();
    expect(within(output).queryByRole('table')).not.toBeInTheDocument();
  });

  it('highlights the preview block that the focused input fills', () => {
    render(<Harness />);
    const how = block('com_skills_builder_how') as HTMLElement;
    expect(how).toHaveAttribute('data-active', 'false');

    fireEvent.focus(textarea());
    expect(how).toHaveAttribute('data-active', 'true');
    expect(how).toHaveClass('border-ring-primary');

    fireEvent.click(within(block('com_skills_builder_when') as HTMLElement).getByRole('button'));
    expect(block('com_skills_builder_when')).toHaveAttribute('data-active', 'true');
    expect(how).toHaveAttribute('data-active', 'false');
  });
});
