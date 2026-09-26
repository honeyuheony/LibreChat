import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { Agents, TaskProgressEvent } from 'librechat-data-provider';

export type TaskPanelState = {
  open: boolean;
  view: 'overview' | 'result';
  resultId: string | null;
};

export const taskPanelState = atom<TaskPanelState>({
  open: false,
  view: 'overview',
  resultId: null,
});

export const taskProgressByToolCallId = atomFamily((_toolCallId: string) =>
  atom<TaskProgressEvent | null>(null),
);

/** The decision the server accepted for a task call's confirmation card. The call
 *  keeps its `approval` until it returns, so this is what says it no longer waits. */
export const taskDecisionByToolCallId = atomFamily((_toolCallId: string) =>
  atom<Agents.ToolApprovalDecisionType | null>(null),
);
