import React from 'react';
import { ContentTypes } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import type { TMessageContentParts } from 'librechat-data-provider';
import Part from '../../Part';

jest.mock('../TaskPlanCard', () => ({
  __esModule: true,
  default: ({ toolName, approval }: { toolName: string; approval?: unknown }) => (
    <div data-testid="task-plan-card" data-tool={toolName} data-paused={String(approval != null)} />
  ),
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

const renderPart = (part: TMessageContentParts) =>
  render(<Part part={part} isSubmitting={false} showCursor={false} isCreatedByUser={false} />);

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

  it('keeps the generic card and approval controls for other paused tools', () => {
    renderPart(pausedCall('some_mcp_tool'));

    expect(screen.getByTestId('tool-call')).toBeInTheDocument();
    expect(screen.getByTestId('tool-approval')).toBeInTheDocument();
    expect(screen.queryByTestId('task-plan-card')).not.toBeInTheDocument();
  });
});
