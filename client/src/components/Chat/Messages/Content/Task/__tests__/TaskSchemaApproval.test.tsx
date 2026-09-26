import React, { useEffect } from 'react';
import { dataService } from 'librechat-data-provider';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Agents } from 'librechat-data-provider';
import { useApprovalContext, useResumeSubmit } from '../../ApprovalContext';
import { CONVERSATION_ID, createTaskWrapper } from 'test/task-test-utils';
import TaskSchemaApproval from '../TaskSchemaApproval';

const mockApprovalMutate = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) =>
    values == null ? key : `${key}:${Object.values(values).join('|')}`,
}));
jest.mock('~/data-provider', () => ({
  useSubmitToolApprovalMutation: () => ({ mutate: mockApprovalMutate }),
  useSubmitAskAnswerMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('~/store/agents', () => ({ useGetEphemeralAgent: () => () => undefined }));
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService, getTaskEstimate: jest.fn() } };
});

const mockEstimate = jest.mocked(dataService.getTaskEstimate);

const approval = (
  allowed: Agents.ToolApprovalDecisionType[] = ['approve', 'reject', 'edit'],
): NonNullable<Agents.ToolCall['approval']> => ({
  actionId: 'action-1',
  allowed_decisions: allowed,
});

const args = {
  fields: ['정세 전망', '전월 대비', '위험도'],
  suggested_fields: ['출처 매체', '관련 지표'],
};

const renderCard = (
  cardArgs: Record<string, unknown> = args,
  allowed?: Agents.ToolApprovalDecisionType[],
) =>
  render(<TaskSchemaApproval approval={approval(allowed)} toolCallId="call-1" args={cardArgs} />, {
    wrapper: createTaskWrapper(),
  });

const submittedDecisions = () =>
  (mockApprovalMutate.mock.calls[0][0] as { decisions: Agents.ToolApprovalResolution[] }).decisions;

beforeEach(() => {
  mockApprovalMutate.mockReset();
  mockEstimate.mockReset();
  mockEstimate.mockResolvedValue({
    docs: 12,
    cached: 0,
    minutes: { min: 1, max: 1 },
    allCached: false,
  });
});

describe('TaskSchemaApproval', () => {
  test('shows model fields switched on and suggested fields switched off', () => {
    renderCard();

    for (const name of args.fields) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
    for (const name of args.suggested_fields) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('submits an edit whose fields match the chips after one is turned off and one added', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: '위험도' }));
    fireEvent.click(screen.getByRole('button', { name: '관련 지표' }));
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_add_field' }));
    const input = screen.getByRole('textbox', { name: 'com_ui_task_add_field_placeholder' });
    fireEvent.change(input, { target: { value: '담당 부서' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_run' }));

    expect(mockApprovalMutate).toHaveBeenCalledTimes(1);
    expect(mockApprovalMutate.mock.calls[0][0]).toMatchObject({
      conversationId: CONVERSATION_ID,
      actionId: 'action-1',
    });
    expect(submittedDecisions()).toEqual([
      {
        tool_call_id: 'call-1',
        decision: 'edit',
        editedArguments: {
          fields: ['정세 전망', '전월 대비', '관련 지표', '담당 부서'],
          suggested_fields: ['출처 매체', '관련 지표'],
        },
      },
    ]);
  });

  test('approves without edits when the chips were left as the model proposed', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_run' }));

    expect(submittedDecisions()).toEqual([{ tool_call_id: 'call-1', decision: 'approve' }]);
  });

  test('disables run when every chip is switched off', () => {
    renderCard({ fields: ['정세 전망'] });

    fireEvent.click(screen.getByRole('button', { name: '정세 전망' }));

    expect(screen.getByRole('button', { name: 'com_ui_task_run' })).toBeDisabled();
  });

  test('shows the document count and estimate returned for the selected fields', async () => {
    mockEstimate.mockResolvedValue({
      docs: 40,
      cached: 5,
      minutes: { min: 2, max: 3 },
      allCached: false,
    });
    renderCard();

    expect(
      await screen.findByText('com_ui_task_schema_intro:40', { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('com_ui_task_estimate:2|3 · com_ui_task_estimate_cached'),
    ).toBeInTheDocument();
    expect(mockEstimate).toHaveBeenCalledWith(CONVERSATION_ID, args.fields);
  });

  test('keeps the card usable without a count when the estimate request fails', async () => {
    mockEstimate.mockRejectedValue(new Error('404'));
    renderCard();

    await waitFor(() => expect(mockEstimate).toHaveBeenCalled());
    expect(screen.getByText('com_ui_task_schema_intro_nocount')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_task_run' })).toBeEnabled();
  });

  test('locks the chips and shows the ran label once the decision is sent', async () => {
    mockApprovalMutate.mockImplementation((_payload, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_run' }));

    expect(await screen.findByText('com_ui_task_ran')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '정세 전망' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'com_ui_task_run' })).not.toBeInTheDocument();
  });

  test('cancels the call with a reject and says so once it is sent', async () => {
    mockApprovalMutate.mockImplementation((_payload, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_cancel' }));

    expect(submittedDecisions()).toEqual([{ tool_call_id: 'call-1', decision: 'reject' }]);
    expect(await screen.findByText('com_ui_task_cancelled')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_task_ran')).not.toBeInTheDocument();
  });

  test('offers no cancel when the policy does not allow a reject', () => {
    renderCard(args, ['approve', 'edit']);

    expect(screen.queryByRole('button', { name: 'com_ui_cancel' })).not.toBeInTheDocument();
  });

  /** Another call paused in the same batch, decided the way the composer panel does it. */
  function OtherCall() {
    const { registerToolCall, setDecision } = useApprovalContext();
    const { submitToolApproval } = useResumeSubmit();
    useEffect(() => registerToolCall('action-1', 'call-2'), [registerToolCall]);
    return (
      <button
        type="button"
        aria-label="decide-other"
        onClick={() => {
          setDecision('action-1', 'call-2', { tool_call_id: 'call-2', decision: 'approve' });
          submitToolApproval('action-1');
        }}
      />
    );
  }

  test('says other approvals remain and sends the batch once the last one is decided', () => {
    render(
      <>
        <TaskSchemaApproval approval={approval()} toolCallId="call-1" args={args} />
        <OtherCall />
      </>,
      { wrapper: createTaskWrapper() },
    );

    expect(screen.getByText('com_ui_task_other_approvals_pending:1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_run' }));
    expect(mockApprovalMutate).not.toHaveBeenCalled();
    expect(screen.getByText('com_ui_task_decision_saved_waiting:1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'decide-other' }));
    expect(mockApprovalMutate).toHaveBeenCalledTimes(1);
    expect(submittedDecisions()).toEqual([
      { tool_call_id: 'call-1', decision: 'approve' },
      { tool_call_id: 'call-2', decision: 'approve' },
    ]);
  });
});
