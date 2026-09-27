import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { TSkill, TSkillDraft } from 'librechat-data-provider';
import type { SessionDeps } from '../useSession';
import type { BuilderState } from '../state';
import type { PeerExample } from '../peers';
import { DRAFT_DEBOUNCE_MS } from '../useDraft';
import useSession from '../useSession';
import { chatState } from '../chat';
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

type HarnessProps = {
  chat?: BuilderState;
  department?: string;
  peers?: PeerExample[];
  onPeek?: (open: boolean) => void;
};

function Harness({ chat, department, peers = [], onPeek }: HarnessProps) {
  const session = useSession(deps, { chat });
  return (
    <Builder
      session={session}
      author="홍길동"
      department={department}
      connectorChoices={['confluence', 'jira', 'mail']}
      peers={peers}
      onPeek={onPeek}
      onCancel={jest.fn()}
      onPublish={jest.fn()}
    />
  );
}

const peer: PeerExample = {
  skill: {
    _id: 'peer-1',
    name: 'weekly-report',
    displayTitle: '주간보고 작성',
    icon: '📋',
    authorName: '박지원',
    authorDepartment: '기획팀',
    useCount: 1200,
  } as TSkill,
  text: '팀원 주간보고를 취합한다. 금주 실적과 차주 계획을 나눈다.\n마감은 금요일이다.',
};

/** 예 목록의 첫 항목. 항목 안에 번호 목록이 들어 있어 바깥 목록의 직계 자식으로 찾는다. */
const peerItem = () =>
  screen.getByRole('list', { name: 'com_skills_builder_peek' }).firstElementChild as HTMLElement;
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

  it('dims the page behind the editor with a light, blurred scrim like the wireframe .ov', () => {
    render(<Harness />);
    const overlay = document.querySelector('[data-state="open"].fixed.inset-0');
    expect(overlay).toHaveClass('bg-black/[0.38]', 'backdrop-blur-[6px]');
    expect(overlay).not.toHaveClass('bg-black/80');
    expect(overlay).toHaveClass(
      '[@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none',
      '[@media(prefers-reduced-transparency:reduce)]:bg-black/[0.55]',
    );
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

  it('takes every attached document off at once with 모두 지우기 next to the chips', () => {
    const chat = chatState('출장 메모를 보고서로 만든다.', {
      output: 'report',
      fields: [],
      files: ['출장 메모.hwp', '지난 보고.pdf'],
      connectors: [],
    });
    render(<Harness chat={chat} />);
    const chips = screen.getByRole('list', { name: 'com_skills_builder_files_list' });
    expect(within(chips).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('com_skills_builder_files_later');

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_clear_all' }));

    expect(screen.queryByRole('list', { name: 'com_skills_builder_files_list' })).toBeNull();
    expect(screen.queryByText('출장 메모.hwp')).toBeNull();
    expect(screen.getByText('com_skills_builder_files_hint')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'com_ui_clear_all' })).toBeNull();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows no 모두 지우기 while no document is attached', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'com_ui_clear_all' })).toBeNull();
  });

  it('lists others’ agents with their text and closes the list again', () => {
    const onPeek = jest.fn();
    render(<Harness peers={[peer]} onPeek={onPeek} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_peek' }));

    expect(onPeek).toHaveBeenLastCalledWith(true);
    const item = peerItem();
    expect(within(item).getByText('주간보고 작성')).toBeVisible();
    expect(item).toHaveTextContent('com_skills_meta_runs:{"value":"1,200"}');
    expect(item.querySelector('ol')).toHaveTextContent('마감은 금요일이다.');

    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_peek_close' }));
    expect(onPeek).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('list', { name: 'com_skills_builder_peek' })).not.toBeInTheDocument();
  });

  it('uses normal weight for the close-examples button', () => {
    render(<Harness peers={[peer]} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_peek' }));

    expect(screen.getByRole('button', { name: 'com_skills_builder_peek_close' })).toHaveClass(
      'font-normal',
    );
  });

  it('says there is nothing to show when no example is visible', () => {
    render(<Harness peers={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_peek' }));
    expect(screen.getByText('com_skills_builder_peek_empty')).toBeVisible();
  });

  it('copies an example into the text box one sentence per line, as direct text from that agent', () => {
    render(<Harness peers={[peer]} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_peek' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_peek_copy' }));

    expect(screen.getByLabelText('com_skills_builder_how')).toHaveValue(
      '팀원 주간보고를 취합한다.\n금주 실적과 차주 계획을 나눈다.\n마감은 금요일이다.',
    );
    const textSection = screen.getByLabelText('com_skills_builder_how').closest('section');
    expect(
      within(textSection as HTMLElement).getByText(
        'com_skills_builder_source_copied:{"name":"주간보고 작성"}',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('list', { name: 'com_skills_builder_peek' })).not.toBeInTheDocument();
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

  /** The wireframe draws empty hints in its gray-400 (166,166,182). The theme
   *  has no role at that value, so the hints fade the muted role to 60%, which
   *  lands on about (166,166,176) over white. The class has to name a color
   *  the Tailwind config really defines: an unknown role emits no CSS and the
   *  hint inherits the black body text. */
  it('fades empty preview hints from a color the theme defines', () => {
    render(<Harness />);
    const { theme } = jest.requireActual<{
      theme: { extend: { colors: Record<string, string> } };
    }>(`${process.cwd()}/tailwind.config.cjs`);

    for (const hint of [
      'com_skills_builder_name_ghost',
      'com_skills_builder_desc_ghost',
      'com_skills_builder_when_ghost',
      'com_skills_builder_how_ghost',
    ]) {
      const ghost = screen.getByText(hint);
      expect(ghost).toHaveClass('text-text-muted/60');
      const roles = [...ghost.classList]
        .filter((name) => name.startsWith('text-text-'))
        .map((name) => name.slice('text-'.length).split('/')[0]);
      roles.forEach((role) => expect(theme.extend.colors[role]).toBeDefined());
    }
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

describe('Builder sized and styled like the wireframe editor (07)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('splits the columns .9 : 1.1 and caps each at 70vh so the modal ends where its content does', () => {
    render(<Harness />);
    const grid = textarea().closest('section')?.parentElement?.parentElement as HTMLElement;
    expect(grid).toHaveClass('md:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]');
    const columns = Array.from(grid.children);
    expect(columns).toHaveLength(2);
    columns.forEach((column) => expect(column).toHaveClass('md:max-h-[70vh]'));
  });

  it('shows the unnamed draft folder as agent-draft/', () => {
    render(<Harness />);
    expect(screen.getByText('skills/agent-draft/SKILL.md')).toBeInTheDocument();
    expect(screen.getAllByText('▾ agent-draft/')).toHaveLength(2);
    expect(screen.queryByText(/new-agent/)).not.toBeInTheDocument();
  });

  it('highlights the selected SKILL.md row and its agent-body label', () => {
    render(<Harness />);

    const skillRow = screen.getByRole('treeitem', { name: /SKILL\.md/ });
    expect(skillRow).toHaveClass('text-accent-primary');
    expect(within(skillRow).getByText('com_skills_builder_folder_main')).toHaveClass(
      'text-accent-primary',
    );
  });

  it('still saves an unnamed draft under a generated agent- name, not the draft folder name', async () => {
    (deps.requestDraft as jest.Mock).mockResolvedValueOnce({ ...draft, slug: '' });
    render(<Harness />);
    await typeText('해외 출장 메모를 출장보고 양식으로 만든다.');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_test_run' }));
    });
    const [[payload]] = (deps.createSkill as jest.Mock).mock.calls.slice(-1);
    expect(payload.name).toMatch(/^agent-[0-9a-z]+$/);
    expect(payload.name).not.toBe('agent-draft');
  });

  it('lets the test button be pressed before any text, then asks for the text instead of saving', () => {
    (deps.createSkill as jest.Mock).mockClear();
    render(<Harness />);
    const test = screen.getByRole('button', { name: 'com_skills_builder_test_run' });
    expect(test).toBeEnabled();
    expect(test).toHaveClass('bg-surface-submit');

    fireEvent.click(test);
    expect(deps.createSkill).not.toHaveBeenCalled();
    expect(screen.getByText('com_skills_builder_test_needs_text')).toBeVisible();
    expect(textarea()).toHaveFocus();

    fireEvent.change(textarea(), { target: { value: '회의록을 정리한다.' } });
    expect(screen.queryByText('com_skills_builder_test_needs_text')).not.toBeInTheDocument();
  });

  it('frames the attach row with a solid line and a small pill button carrying the clip icon', () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: /com_skills_builder_files_attach/ });
    const row = button.parentElement as HTMLElement;
    expect(row).not.toHaveClass('border-dashed');
    expect(row).toHaveClass('border-solid');
    expect(button).toHaveClass('rounded-full', 'h-auto');
    const clip = within(button).getByText('📎');
    expect(clip.style.fontFamily).toContain('Noto Color Emoji');
  });

  it('uses pill-shaped buttons in the editor footer', () => {
    render(<Harness />);

    const footer = screen
      .getByRole('dialog', { name: 'com_skills_new_agent' })
      .querySelector('footer');
    expect(footer).not.toBeNull();
    const buttons = within(footer as HTMLElement).getAllByRole('button');
    expect(buttons).toHaveLength(3);
    buttons.forEach((button) => expect(button).toHaveClass('rounded-theme-control-round'));
  });

  it('draws the draft icon with an emoji font so the circle is not left blank', () => {
    render(<Harness />);
    const icon = within(
      screen.getByRole('button', { name: 'com_skills_builder_icon_change' }),
    ).getByText('🤖');
    expect(icon.style.fontFamily).toContain('Noto Color Emoji');
  });

  it('dims the page as lightly as the wireframe scrim', () => {
    render(<Harness />);
    const overlay = document.querySelector('[data-state="open"].fixed.inset-0');
    expect(overlay).toHaveClass(
      'bg-black/[0.38]',
      '[@media(prefers-reduced-transparency:reduce)]:bg-black/[0.55]',
    );
  });
});

describe('Others’ examples shown like the wireframe (08)', () => {
  it('lists each example line by line as a numbered list in the body font instead of raw text', () => {
    render(<Harness peers={[peer]} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_peek' }));
    const item = peerItem();
    expect(item.querySelector('pre')).toBeNull();
    const steps = item.querySelector('ol') as HTMLElement;
    expect(steps).toHaveClass('list-decimal', 'font-sans');
    expect(Array.from(steps.children).map((line) => line.textContent)).toEqual([
      '팀원 주간보고를 취합한다. 금주 실적과 차주 계획을 나눈다.',
      '마감은 금요일이다.',
    ]);
  });

  it('writes the author line as owner · department · runs, without By or adaptations', () => {
    render(<Harness peers={[{ ...peer, skill: { ...peer.skill, forkCount: 41 } as TSkill }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_peek' }));
    const item = peerItem();
    expect(item).toHaveTextContent('박지원 · 기획팀 · com_skills_meta_runs:{"value":"1,200"}');
    expect(item).not.toHaveTextContent('com_skills_by_author');
    expect(item).not.toHaveTextContent('com_skills_meta_forks');
  });

  it('outlines the how-it-works card while the examples are open', () => {
    render(<Harness peers={[peer]} />);
    const how = block('com_skills_builder_how') as HTMLElement;
    expect(how).toHaveAttribute('data-active', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'com_skills_builder_peek' }));
    expect(how).toHaveAttribute('data-active', 'true');
  });
});
