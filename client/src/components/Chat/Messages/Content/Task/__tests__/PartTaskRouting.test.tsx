import React from 'react';
import { ContentTypes } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import type { TAttachment, TMessage, TMessageContentParts } from 'librechat-data-provider';
import Part from '../../Part';

type TaskResultTestAttachment = {
  type?: string;
  task_result?: { file?: { file_id?: string } };
};

jest.mock('../TaskPlanCard', () => ({
  __esModule: true,
  default: ({
    toolName,
    approval,
    attachments,
  }: {
    toolName: string;
    approval?: unknown;
    attachments?: TaskResultTestAttachment[];
  }) => {
    const result = attachments?.find((attachment) => attachment.type === 'task_result');
    return (
      <div
        data-testid="task-plan-card"
        data-tool={toolName}
        data-paused={String(approval != null)}
        data-file-id={result?.task_result?.file?.file_id}
      />
    );
  },
}));
jest.mock('../../ToolApproval', () => ({
  __esModule: true,
  default: () => <div data-testid="tool-approval" />,
}));
jest.mock('../../ToolCall', () => ({
  __esModule: true,
  default: () => <div data-testid="tool-call" />,
}));

const pausedCall = (name: string): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id: 'call_1',
      name,
      args: '{"fields":["정세 전망"]}',
      output: '',
      approval: { actionId: 'action-1', allowed_decisions: ['approve', 'reject', 'edit'] },
    },
  }) as unknown as TMessageContentParts;

const renderPart = (part: TMessageContentParts | undefined, attachments?: TAttachment[]) =>
  render(
    <Part
      part={part}
      attachments={attachments}
      isSubmitting={false}
      showCursor={false}
      isCreatedByUser={false}
    />,
  );

const savedFillMessage = {
  messageId: 'message-1',
  isCreatedByUser: false,
  content: [
    {
      type: ContentTypes.TOOL_CALL,
      [ContentTypes.TOOL_CALL]: {
        id: 'call-fill',
        name: 'fill_report_template',
        args: '{"template":"report-form.hwpx","values":{"제목":"분기 보고서"}}',
        output: '보고서 결과가 저장되었습니다.',
        progress: 1,
        runStepDurationMs: 500,
        runStepStatus: 'complete',
        stepId: 'step-fill',
        type: 'tool_call',
      },
    },
  ],
  attachments: [
    {
      type: 'task_result',
      toolCallId: 'call-fill',
      messageId: 'message-1',
      conversationId: 'conversation-1',
      stepId: 'step-fill',
      agentId: 'agent-1',
      task_result: {
        resultId: 'result-fill',
        kind: 'report',
        title: 'trip-report',
        stats: {},
        file: { file_id: 'file-fill', filename: 'filled-report.hwpx' },
      },
    },
  ],
} as unknown as TMessage;

describe('Part routing for task tools', () => {
  it.each(['extract_table', 'summarize_documents', 'write_report'])(
    'renders %s with the task plan card and without the generic approval controls',
    (name) => {
      renderPart(pausedCall(name));

      expect(screen.getByTestId('task-plan-card')).toHaveAttribute('data-tool', name);
      expect(screen.getByTestId('task-plan-card')).toHaveAttribute('data-paused', 'true');
      expect(screen.queryByTestId('tool-approval')).not.toBeInTheDocument();
    },
  );

  it('renders a saved fill_report_template result as a task card', () => {
    renderPart(savedFillMessage.content?.[0], savedFillMessage.attachments);

    expect(screen.getByTestId('task-plan-card')).toHaveAttribute(
      'data-tool',
      'fill_report_template',
    );
    expect(screen.getByTestId('task-plan-card')).toHaveAttribute('data-file-id', 'file-fill');
    expect(screen.queryByTestId('tool-call')).not.toBeInTheDocument();
  });

  it('keeps the generic card and approval controls for other paused tools', () => {
    renderPart(pausedCall('some_mcp_tool'));

    expect(screen.getByTestId('tool-call')).toBeInTheDocument();
    expect(screen.getByTestId('tool-approval')).toBeInTheDocument();
    expect(screen.queryByTestId('task-plan-card')).not.toBeInTheDocument();
  });
});
