import React from 'react';
import { RecoilRoot } from 'recoil';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Agents } from 'librechat-data-provider';
import { PendingToolApprovalButton, PendingToolApprovalPanel } from '../Review';
import { composerOverlayCountFamily } from '~/components/Chat/Input/overlay';
import ApprovalProvider from '../../Messages/Content/ApprovalContext';
import { pendingApprovalActionFamily } from '../state';

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  TextareaAutosize: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string | number, string | number>) => {
    const labels: Record<string, string> = {
      com_ui_review_action: 'Review 1 action',
      com_ui_review_actions: `Review ${values?.[0]} actions`,
      com_ui_review_run_command: 'Run command',
      com_ui_review_create_file: `Create ${values?.[0]}`,
      com_ui_review_create_file_generic: 'Create file',
      com_ui_review_edit_file: `Edit ${values?.[0]}`,
      com_ui_review_edit_file_generic: 'Edit file',
      com_ui_proposed_command: 'Proposed command',
      com_ui_proposed_contents: 'Proposed contents',
      com_ui_proposed_replacements: 'Proposed replacements',
      com_ui_proposed_arguments: 'Proposed arguments',
      com_ui_decisions_selected: `${values?.[0]} of ${values?.[1]} decisions selected`,
      com_ui_approve_once: 'Allow once',
      com_ui_reject: 'Reject',
      com_ui_continue: 'Continue',
      com_ui_collapse: 'Collapse',
    };
    return labels[key] ?? key;
  },
}));

jest.mock('~/hooks/MCP', () => ({
  useMCPServerNames: () => [],
}));

jest.mock('~/components/Chat/Messages/Content/connectors', () => ({
  useConnectorTitles: () => new Map(),
  getConnectorTitle: (_titles: Map<string, string>, server: string) => server,
}));

jest.mock('~/data-provider', () => ({
  useSubmitToolApprovalMutation: () => ({ mutate: jest.fn() }),
  useSubmitAskAnswerMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('~/store/agents', () => ({
  useGetEphemeralAgent: () => () => undefined,
}));

const pendingAction: Agents.PendingAction = {
  actionId: 'action-1',
  streamId: 'stream-1',
  conversationId: 'conversation-1',
  createdAt: 1000,
  payload: {
    type: 'tool_approval',
    action_requests: [
      {
        name: 'create_file',
        source: 'librechat_code',
        tool_call_id: 'call-1',
        arguments: { path: 'src/new.ts', content: 'export const value = 1;' },
      },
      {
        name: 'bash_tool',
        source: 'librechat_code',
        tool_call_id: 'call-2',
        arguments: { command: 'npm test -- new' },
      },
    ],
    review_configs: [
      {
        action_name: 'create_file',
        tool_call_id: 'call-1',
        allowed_decisions: ['approve', 'reject'],
      },
      {
        action_name: 'bash_tool',
        tool_call_id: 'call-2',
        allowed_decisions: ['approve', 'reject'],
      },
    ],
  },
};

describe('PendingToolApproval', () => {
  test('reviews the authoritative batch beside the composer and can be collapsed', async () => {
    const jotaiStore = createStore();
    jotaiStore.set(pendingApprovalActionFamily('conversation-1'), pendingAction);
    render(
      <RecoilRoot>
        <JotaiProvider store={jotaiStore}>
          <ApprovalProvider pendingAction={pendingAction}>
            <PendingToolApprovalPanel conversationId="conversation-1" />
            <PendingToolApprovalButton conversationId="conversation-1" />
          </ApprovalProvider>
        </JotaiProvider>
      </RecoilRoot>,
    );

    expect(await screen.findByRole('region', { name: 'Review 2 actions' })).toBeInTheDocument();
    expect(jotaiStore.get(composerOverlayCountFamily('conversation-1'))).toBe(1);
    expect(screen.getByText(/Create src\/new\.ts/)).toBeInTheDocument();
    expect(screen.getByText('npm test -- new')).toBeInTheDocument();
    expect(screen.getByText('0 of 2 decisions selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    const approvals = screen.getAllByRole('button', { name: 'Allow once' });
    fireEvent.click(approvals[0]);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.click(approvals[1]);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(screen.getByText('2 of 2 decisions selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.queryByRole('region', { name: 'Review 2 actions' })).not.toBeInTheDocument();
    expect(jotaiStore.get(composerOverlayCountFamily('conversation-1'))).toBe(0);
    expect(screen.getByTestId('pending-tool-approval-button')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  const renderWith = (action: Agents.PendingAction) => {
    const jotaiStore = createStore();
    jotaiStore.set(pendingApprovalActionFamily('conversation-1'), action);
    render(
      <RecoilRoot>
        <JotaiProvider store={jotaiStore}>
          <ApprovalProvider pendingAction={action}>
            <PendingToolApprovalPanel conversationId="conversation-1" />
            <PendingToolApprovalButton conversationId="conversation-1" />
          </ApprovalProvider>
        </JotaiProvider>
      </RecoilRoot>,
    );
    return jotaiStore;
  };

  const taskRequest = (name: string, id: string) => ({
    request: { name, source: 'librechat', tool_call_id: id, arguments: { fields: ['위험도'] } },
    config: { action_name: name, tool_call_id: id, allowed_decisions: ['approve', 'edit'] },
  });

  const withRequests = (
    entries: {
      request: Agents.ToolApprovalRequest;
      config: Agents.ToolApprovalInterruptPayload['review_configs'][number];
    }[],
  ): Agents.PendingAction => ({
    ...pendingAction,
    payload: {
      type: 'tool_approval',
      action_requests: entries.map((entry) => entry.request),
      review_configs: entries.map((entry) => entry.config),
    },
  });

  test('leaves field and perspective approvals to their cards in the message', () => {
    const jotaiStore = renderWith(
      withRequests([
        taskRequest('extract_table', 'task-1'),
        taskRequest('summarize_documents', 'task-2'),
      ]),
    );

    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pending-tool-approval-button')).not.toBeInTheDocument();
    expect(jotaiStore.get(composerOverlayCountFamily('conversation-1'))).toBe(0);
  });

  test('still reviews the other calls of a batch that also holds a card tool', async () => {
    const payload = pendingAction.payload as Agents.ToolApprovalInterruptPayload;
    renderWith(
      withRequests([
        taskRequest('extract_table', 'task-1'),
        { request: payload.action_requests[1], config: payload.review_configs[1] },
        taskRequest('write_report', 'task-3'),
      ]),
    );

    expect(await screen.findByRole('region', { name: 'Review 2 actions' })).toBeInTheDocument();
    expect(screen.getByText('npm test -- new')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2. write_report' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /extract_table/ })).not.toBeInTheDocument();
    expect(screen.getByText('0 of 2 decisions selected')).toBeInTheDocument();
  });
});
