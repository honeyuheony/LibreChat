import React from 'react';
import { createStore } from 'jotai';
import { TaskTools } from 'librechat-data-provider';
import { act, render, screen } from '@testing-library/react';
import type { Agents, TAttachment, TaskToolName } from 'librechat-data-provider';
import { createTaskWrapper } from 'test/task-test-utils';
import { taskProgressByToolCallId } from '~/store/task';
import TaskPlanCard from '../TaskPlanCard';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) =>
    values == null ? key : `${key}:${Object.values(values).join('|')}`,
}));
jest.mock('~/data-provider', () => ({
  useSubmitToolApprovalMutation: () => ({ mutate: jest.fn() }),
  useSubmitAskAnswerMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('~/store/agents', () => ({ useGetEphemeralAgent: () => () => undefined }));
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      getTaskEstimate: jest.fn(() => new Promise(() => undefined)),
    },
  };
});
jest.mock('../TaskResultCard', () => ({
  __esModule: true,
  default: ({
    result,
    autoOpen,
  }: {
    result: { resultId: string; file?: { file_id: string } };
    autoOpen: boolean;
  }) => (
    <div
      data-testid="result-card"
      data-auto-open={String(autoOpen)}
      data-file-id={result.file?.file_id}
    >
      {result.resultId}
    </div>
  ),
}));

const approval: NonNullable<Agents.ToolCall['approval']> = {
  actionId: 'action-1',
  allowed_decisions: ['approve', 'reject', 'edit'],
};

type CardProps = Partial<React.ComponentProps<typeof TaskPlanCard>> & { toolName: TaskToolName };

function renderPlan(props: CardProps, jotaiStore = createStore()) {
  return render(<TaskPlanCard toolCallId="call-1" args={{}} isSubmitting={false} {...props} />, {
    wrapper: createTaskWrapper({ jotaiStore }),
  });
}

const stepStates = () =>
  screen
    .getAllByRole('listitem')
    .map((item) => `${item.getAttribute('data-state')} ${item.textContent}`);

describe('TaskPlanCard', () => {
  test('lists the five table steps and marks field confirmation current while awaiting approval', () => {
    renderPlan({
      toolName: TaskTools.extract_table,
      args: JSON.stringify({ fields: ['정세 전망'] }),
      approval,
    });

    expect(stepStates()).toEqual([
      'done ✓1. com_ui_task_stage_prepare',
      'now ▶2. com_ui_task_stage_confirm_fields',
      'todo ○3. com_ui_task_stage_extract_all',
      'todo ○4. com_ui_task_stage_aggregate',
      'todo ○5. com_ui_task_stage_save',
    ]);
    expect(screen.getByTestId('task-schema-approval')).toBeInTheDocument();
  });

  test('shows the perspective picker, not the field picker, for a paused summary', () => {
    renderPlan({
      toolName: TaskTools.summarize_documents,
      args: { views: ['위험 요인 중심'] },
      approval,
    });

    expect(screen.getByTestId('task-view-approval')).toBeInTheDocument();
    expect(screen.queryByTestId('task-schema-approval')).not.toBeInTheDocument();
  });

  test('moves the current step with progress events and appends the view and count', () => {
    const jotaiStore = createStore();
    renderPlan(
      {
        toolName: TaskTools.summarize_documents,
        args: { views: ['위험 요인 중심'], view: '위험 요인 중심' },
        isSubmitting: true,
      },
      jotaiStore,
    );

    act(() => {
      jotaiStore.set(taskProgressByToolCallId('call-1'), {
        toolCallId: 'call-1',
        stage: 'summarize',
        done: 5,
        total: 12,
        label: '문서별 요약',
      });
    });

    expect(stepStates()[2]).toBe(
      'now ▶3. com_ui_task_stage_summarize · com_ui_task_view_default_risk · 5/12',
    );
    expect(stepStates()[1]).toBe('done ✓2. com_ui_task_stage_confirm_view');
  });

  test('marks every report step done and renders the result once the tool returned', () => {
    const attachments = [
      {
        type: 'task_result',
        toolCallId: 'call-1',
        messageId: 'm1',
        conversationId: 'c1',
        task_result: { resultId: 'result-9', kind: 'report', title: 't', stats: {} },
      },
      { type: 'file_search', toolCallId: 'call-1', messageId: 'm1', conversationId: 'c1' },
    ] as unknown as TAttachment[];
    renderPlan({
      toolName: TaskTools.write_report,
      args: { template_id: 'hwp-report' },
      output: '보고서 초안을 만들었습니다.',
      attachments,
      isSubmitting: true,
    });

    expect(stepStates().every((state) => state.startsWith('done'))).toBe(true);
    expect(stepStates().map((state) => state.split('. ')[1])).toEqual([
      'com_ui_task_stage_prepare',
      'com_ui_task_stage_extract',
      'com_ui_task_stage_compose',
      'com_ui_task_stage_render',
      'com_ui_task_stage_save',
    ]);
    expect(screen.getAllByTestId('result-card').map((card) => card.textContent)).toEqual([
      'result-9',
    ]);
    /** 라이브 결과 패널은 task panel이 직접 열므로 결과 카드에서는 자동으로 열지 않는다. */
    expect(screen.getByTestId('result-card')).toHaveAttribute('data-auto-open', 'undefined');
  });

  test('shows the saved fill-template result and its downloadable file', () => {
    const attachments = [
      {
        type: 'task_result',
        toolCallId: 'call-1',
        messageId: 'm1',
        conversationId: 'c1',
        task_result: {
          resultId: 'result-fill',
          kind: 'report',
          title: 'trip-report',
          stats: {},
          file: { file_id: 'file-fill', filename: 'filled-report.hwpx' },
        },
      },
    ] as unknown as TAttachment[];
    renderPlan({
      toolName: TaskTools.fill_report_template,
      args: { template: 'report-form.hwpx', values: { 제목: '분기 보고서' } },
      output: '결과 카드에 표시했습니다.',
      attachments,
    });

    expect(stepStates()).toEqual([
      'done ✓1. com_ui_task_stage_prepare_template',
      'done ✓2. com_ui_task_stage_fill_template',
      'done ✓3. com_ui_task_stage_save',
    ]);
    expect(screen.getByTestId('result-card')).toHaveTextContent('result-fill');
    expect(screen.getByTestId('result-card')).toHaveAttribute('data-file-id', 'file-fill');
  });

  test('stops on the confirmation step when the paused call was rejected', () => {
    renderPlan({
      toolName: TaskTools.extract_table,
      args: { fields: ['정세 전망'] },
      approval,
      output: '사용자가 실행을 거절했습니다.',
    });

    expect(stepStates()).toEqual([
      'done ✓1. com_ui_task_stage_prepare',
      'stopped ✕2. com_ui_task_stage_confirm_fields',
      'todo ○3. com_ui_task_stage_extract_all',
      'todo ○4. com_ui_task_stage_aggregate',
      'todo ○5. com_ui_task_stage_save',
    ]);
  });

  test('keeps a cancelled call as a read-only card on the step it was cancelled at', () => {
    renderPlan({
      toolName: TaskTools.summarize_documents,
      args: { views: ['부서장 보고용', '실무 공유용'] },
      output: 'Blocked: Rejected by user',
    });

    expect(stepStates().map((state) => state.split(' ')[0])).toEqual([
      'done',
      'stopped',
      'todo',
      'todo',
      'todo',
    ]);
    const card = screen.getByTestId('task-view-ran');
    expect(card).toHaveTextContent('com_ui_task_cancelled');
    expect(card).not.toHaveTextContent('com_ui_task_ran');
  });

  test('stops on the step the progress reached when the call returned without a result', () => {
    const jotaiStore = createStore();
    jotaiStore.set(taskProgressByToolCallId('call-1'), {
      toolCallId: 'call-1',
      stage: 'compose',
      done: 0,
      total: 1,
      label: '',
    });
    renderPlan(
      {
        toolName: TaskTools.write_report,
        args: {},
        output: '문서가 없습니다. 먼저 파일을 올려 주세요.',
      },
      jotaiStore,
    );

    expect(stepStates().map((state) => state.split(' ')[0])).toEqual([
      'done',
      'done',
      'stopped',
      'todo',
      'todo',
    ]);
  });

  test('hides the pickers once the paused call has an output', () => {
    renderPlan({
      toolName: TaskTools.extract_table,
      args: { fields: ['정세 전망'] },
      approval,
      output: 'done',
    });

    expect(screen.queryByTestId('task-schema-approval')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-schema-ran')).not.toBeInTheDocument();
  });

  const resultAttachment = (kind: string) =>
    [
      {
        type: 'task_result',
        toolCallId: 'call-1',
        messageId: 'm1',
        conversationId: 'c1',
        task_result: { resultId: 'result-1', kind, title: 't', stats: {} },
      },
    ] as unknown as TAttachment[];

  test('keeps the fields the table ran with as a read-only card marked as run', () => {
    renderPlan({
      toolName: TaskTools.extract_table,
      args: JSON.stringify({ fields: ['정세 전망', '위험도'], suggested_fields: ['출처 매체'] }),
      output: 'done',
      attachments: resultAttachment('table'),
    });

    const card = screen.getByTestId('task-schema-ran');
    expect(card).toHaveTextContent('com_ui_task_ran');
    expect(screen.queryByRole('button', { name: 'com_ui_task_run' })).not.toBeInTheDocument();
    for (const name of ['정세 전망', '위험도']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: '출처 매체' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('keeps the perspective the summary ran with as a read-only card marked as run', () => {
    renderPlan({
      toolName: TaskTools.summarize_documents,
      args: { views: ['간부 보고용', '위험 요인 중심'], view: '남북 교류 영향' },
      output: 'done',
      attachments: resultAttachment('summary'),
    });

    expect(screen.getByTestId('task-view-ran')).toHaveTextContent('com_ui_task_ran');
    expect(screen.getByRole('button', { name: '남북 교류 영향' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'com_ui_task_view_default_brief' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
