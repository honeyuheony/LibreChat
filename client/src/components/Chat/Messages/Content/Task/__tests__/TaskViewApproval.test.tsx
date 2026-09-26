import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Agents } from 'librechat-data-provider';
import { createTaskWrapper } from 'test/task-test-utils';
import TaskViewApproval from '../TaskViewApproval';

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

const approval: NonNullable<Agents.ToolCall['approval']> = {
  actionId: 'action-1',
  allowed_decisions: ['approve', 'reject', 'edit'],
};

const views = ['부서장 보고용', '실무 공유용', '대외 설명용'];

const renderCard = (args: Record<string, unknown>) =>
  render(<TaskViewApproval approval={approval} toolCallId="call-1" args={args} />, {
    wrapper: createTaskWrapper(),
  });

const runButton = () => screen.getByRole('button', { name: 'com_ui_task_run' });

const submittedDecision = () =>
  (mockApprovalMutate.mock.calls[0][0] as { decisions: Agents.ToolApprovalResolution[] })
    .decisions[0];

beforeEach(() => mockApprovalMutate.mockReset());

describe('TaskViewApproval', () => {
  test('keeps run disabled until a perspective is picked', () => {
    renderCard({ views });

    expect(runButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '실무 공유용' }));
    expect(runButton()).toBeEnabled();
  });

  test('leaves every perspective unpicked even when the model already passed a view', () => {
    renderCard({ views, view: '실무 공유용' });

    for (const name of views) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(runButton()).toBeDisabled();
  });

  test('submits an edit carrying the picked perspective as view', () => {
    renderCard({ views });

    fireEvent.click(screen.getByRole('button', { name: '대외 설명용' }));
    fireEvent.click(runButton());

    expect(mockApprovalMutate).toHaveBeenCalledTimes(1);
    expect(submittedDecision()).toEqual({
      tool_call_id: 'call-1',
      decision: 'edit',
      editedArguments: { views, view: '대외 설명용' },
    });
  });

  test('picks and submits a perspective typed with the custom entry', () => {
    renderCard({ views });

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_view_custom' }));
    const input = screen.getByRole('textbox', { name: 'com_ui_task_view_custom_placeholder' });
    fireEvent.change(input, { target: { value: '남북 교류 영향' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('button', { name: '남북 교류 영향' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(runButton());
    expect(submittedDecision().editedArguments?.view).toBe('남북 교류 영향');
  });

  test('offers the three default perspectives when the model passed none', () => {
    renderCard({ views: [] });

    expect(
      screen.getAllByRole('button', { pressed: false }).map((button) => button.textContent),
    ).toEqual([
      'com_ui_task_view_default_brief',
      'com_ui_task_view_default_risk',
      'com_ui_task_view_default_policy',
    ]);
  });

  test('sends a default perspective as its Korean value while the chip shows the translation', () => {
    renderCard({});

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_view_default_risk' }));
    fireEvent.click(runButton());

    expect(submittedDecision().editedArguments).toEqual({
      views: ['간부 보고용', '위험 요인 중심', '정책 시사점 중심'],
      view: '위험 요인 중심',
    });
  });
});
