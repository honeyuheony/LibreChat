import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import type { TaskProgressEvent } from 'librechat-data-provider';

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
