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

/** 서버가 승인한 결정을 도구 호출이 끝날 때까지 보관해 확인 카드의 대기 표시를 해제한다. */
export const taskDecisionByToolCallId = atomFamily((_toolCallId: string) =>
  atom<Agents.ToolApprovalDecisionType | null>(null),
);
