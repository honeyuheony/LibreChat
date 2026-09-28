import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { TaskRunStatus } from '~/components/Task/useTaskRunState';
import Header from '../Header';

let mockTaskState: { call: object | null; status: TaskRunStatus };

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ user: undefined }),
  useHasAccess: () => false,
}));
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: undefined }),
  useGetMessagesByConvoId: () => ({ data: 0 }),
}));
jest.mock('~/components/Task/useTaskRunState', () => ({
  ...jest.requireActual('~/components/Task/useTaskRunState'),
  __esModule: true,
  default: () => mockTaskState,
}));
jest.mock('../Menus/ConversationTitleMenu', () => ({ __esModule: true, default: () => null }));
jest.mock('../Menus', () => ({
  OpenSidebar: () => null,
  NewChat: () => null,
  HeaderMenu: () => null,
}));
jest.mock('../TemporaryChat', () => ({ TemporaryChatIndicator: () => null }));
jest.mock('../ExportAndShareMenu', () => ({ __esModule: true, default: () => null }));
jest.mock('../SubagentThreadLink', () => ({ __esModule: true, default: () => null }));
jest.mock('../Trace', () => ({ useTraceControl: () => ({}) }));

const renderHeader = () =>
  render(
    <RecoilRoot>
      <MemoryRouter initialEntries={['/c/c1']}>
        <Routes>
          <Route path="/c/:conversationId" element={<Header />} />
        </Routes>
      </MemoryRouter>
    </RecoilRoot>,
  );

describe('Header status', () => {
  it('shows the task status the task panel shows', () => {
    mockTaskState = { call: { toolCallId: 't1' }, status: 'stopped' };
    renderHeader();
    expect(screen.getByText('com_ui_task_status_stopped')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_convo_done')).not.toBeInTheDocument();
  });

  it('keeps the plain done state for a conversation without a task call', () => {
    mockTaskState = { call: null, status: 'ok' };
    renderHeader();
    expect(screen.getByText('com_ui_convo_done')).toBeInTheDocument();
  });
});

describe('Header surface', () => {
  it('blurs the content behind it and marks its lower edge with a shadow instead of a border', () => {
    mockTaskState = { call: null, status: 'ok' };
    const { container } = renderHeader();
    const bar = container.firstElementChild;

    expect(bar).toHaveClass(
      'bg-presentation/70',
      'backdrop-blur-[20px]',
      'backdrop-saturate-[1.8]',
      'shadow-[0_1px_0]',
      'shadow-border-light/60',
    );
    expect(bar).not.toHaveClass('border-b', 'backdrop-blur-md');
  });

  it('keeps its content 24px from both sides from the md breakpoint', () => {
    mockTaskState = { call: null, status: 'ok' };
    const { container } = renderHeader();
    const bar = container.firstElementChild;
    const title = bar?.children[1];

    expect(bar).toHaveClass('md:pl-3', 'md:pr-6');
    expect(bar).not.toHaveClass('md:px-4');
    expect(title).toHaveClass('md:pl-3');
  });
});
