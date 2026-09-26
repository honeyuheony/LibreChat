import { ContentTypes, TaskTools } from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  TaskStats,
  TaskToolName,
  TaskProgressEvent,
} from 'librechat-data-provider';
import type { TaskStage } from '~/components/Chat/Messages/Content/Task/stages';
import type { TranslationKeys } from '~/hooks';
import { TASK_STAGES } from '~/components/Chat/Messages/Content/Task/stages';

const TASK_TOOL_NAMES = new Set<string>(Object.values(TaskTools));

export const isTaskToolName = (name: string | undefined): name is TaskToolName =>
  name != null && TASK_TOOL_NAMES.has(name);

export type TaskToolCallState = {
  toolCallId: string;
  name: TaskToolName;
  awaitingApproval: boolean;
  finished: boolean;
  /** A `task_result` attachment names this call. A rejected, failed or empty-handed
   *  call returns text too, so `finished` alone does not mean it ran to the end. */
  hasResult: boolean;
  /** The call paused for the user's confirmation before it ran. */
  hadApproval: boolean;
};

const TASK_RESULT_ATTACHMENT = 'task_result';

/** Ids of the tool calls that saved a result, read from `task_result` attachments. */
function resultToolCallIds(messages: TMessage[] | undefined): Set<string> {
  const ids = new Set<string>();
  for (const message of messages ?? []) {
    for (const attachment of message.attachments ?? []) {
      const record = attachment as unknown as Record<string, unknown>;
      if (record.type === TASK_RESULT_ATTACHMENT && typeof record.toolCallId === 'string') {
        ids.add(record.toolCallId);
      }
    }
  }
  return ids;
}

/**
 * The SDK answers a rejected call (or one a policy stopped) with `Blocked: <reason>`
 * instead of running it. A finished call no longer carries its `approval`, so after a
 * reload this is what says it stopped at its confirmation.
 */
export function isBlockedTaskOutput(output: string | null | undefined): boolean {
  return typeof output === 'string' && /^(?:Error: )?Blocked:/.test(output.trim());
}

/** The last task tool call in the conversation; the progress section follows only that one. */
export function findLatestTaskToolCall(messages: TMessage[] | undefined): TaskToolCallState | null {
  let latest: TaskToolCallState | null = null;
  const withResult = resultToolCallIds(messages);
  for (const message of messages ?? []) {
    for (const part of message.content ?? []) {
      if (part?.type !== ContentTypes.TOOL_CALL) {
        continue;
      }
      const toolCall = (part as Agents.ToolCallContent).tool_call;
      if (!toolCall || !isTaskToolName(toolCall.name)) {
        continue;
      }
      const finished = toolCall.output != null && toolCall.output !== '';
      const toolCallId = toolCall.id ?? '';
      latest = {
        toolCallId,
        name: toolCall.name,
        awaitingApproval: toolCall.approval != null && !finished,
        finished,
        hasResult: withResult.has(toolCallId),
        hadApproval: toolCall.approval != null || isBlockedTaskOutput(toolCall.output),
      };
    }
  }
  return latest;
}

export type TaskStepState = 'done' | 'now' | 'stopped' | 'todo';

export type TaskStepView = { id: string; label: TranslationKeys; state: TaskStepState };

/**
 * Index of the step a call ended on without a result: the last step its progress
 * reached, else the confirmation step when it paused there (rejected, or stopped
 * right after), else the first step.
 */
export function stoppedStepIndex(
  stages: readonly TaskStage[],
  progress: TaskProgressEvent | null,
  hadApproval: boolean,
): number {
  const progressIndex = stages.findIndex((stage) => stage.id === progress?.stage);
  if (progressIndex >= 0) {
    return progressIndex;
  }
  const confirmIndex = hadApproval ? stages.findIndex((stage) => stage.id === 'confirm') : -1;
  return Math.max(0, confirmIndex);
}

/** What a plan list needs to know about its call. */
export type TaskPlanFacts = Pick<
  TaskToolCallState,
  'awaitingApproval' | 'finished' | 'hasResult' | 'hadApproval'
>;

/**
 * The step a call's plan stands on and whether it is running or stopped there. A
 * call that saved its result is past every step; one that returned without a result
 * (rejected, failed, nothing to work on) stops on the step it reached; otherwise the
 * furthest of the latest progress event and, while paused, the confirmation step.
 */
export function taskPlanPosition(
  stages: readonly TaskStage[],
  call: TaskPlanFacts,
  progress: TaskProgressEvent | null,
): { current: number; currentState: 'now' | 'stopped' } {
  if (call.finished && call.hasResult) {
    return { current: stages.length, currentState: 'now' };
  }
  if (call.finished) {
    return {
      current: stoppedStepIndex(stages, progress, call.hadApproval),
      currentState: 'stopped',
    };
  }
  const progressIndex = stages.findIndex((stage) => stage.id === progress?.stage);
  const confirmIndex = call.awaitingApproval
    ? stages.findIndex((stage) => stage.id === 'confirm')
    : -1;
  return { current: Math.max(0, progressIndex, confirmIndex), currentState: 'now' };
}

/** States for the plan list: steps before `current` done, `current` in `currentState`. */
export function stepStates(
  count: number,
  current: number,
  currentState: 'now' | 'stopped' = 'now',
): TaskStepState[] {
  return Array.from({ length: count }, (_, index) => {
    if (index < current) {
      return 'done';
    }
    return index === current ? currentState : 'todo';
  });
}

/** The plan list for the panel, placed by the same rule as the message's plan card. */
export function resolveTaskSteps(
  call: TaskToolCallState,
  progress: TaskProgressEvent | null,
): TaskStepView[] {
  const stages = TASK_STAGES[call.name];
  const { current, currentState } = taskPlanPosition(stages, call, progress);
  const states = stepStates(stages.length, current, currentState);
  return stages.map((stage, index) => ({ ...stage, state: states[index] }));
}

/**
 * Whether the call still waits on its confirmation card. Its `approval` stays until
 * it returns, so a sent decision, or progress already past the confirmation step,
 * means the run went on.
 */
export function isAwaitingTaskApproval(
  call: TaskToolCallState,
  progress: TaskProgressEvent | null,
  decided: boolean,
): boolean {
  if (!call.awaitingApproval || decided) {
    return false;
  }
  const stages = TASK_STAGES[call.name];
  const progressIndex = stages.findIndex((stage) => stage.id === progress?.stage);
  const confirmIndex = stages.findIndex((stage) => stage.id === 'confirm');
  return progressIndex <= confirmIndex;
}

export type TaskOutputKind = 'table' | 'summary' | 'report';

/** What a message attachment of type `task_result` carries; the body lives on the server. */
export type TaskOutput = {
  resultId: string;
  kind: TaskOutputKind;
  title: string;
  stats?: Partial<TaskStats>;
  createdAt?: string;
};

/**
 * The attachment fields may sit on the attachment itself or under a
 * `task_result` key, the way other tools nest theirs; both are read.
 */
function toTaskOutput(attachment: unknown, fallbackTime?: string): TaskOutput | null {
  if (attachment == null || typeof attachment !== 'object') {
    return null;
  }
  const record = attachment as Record<string, unknown>;
  if (record.type !== TASK_RESULT_ATTACHMENT) {
    return null;
  }
  const nested = record[TASK_RESULT_ATTACHMENT];
  const source = (
    nested != null && typeof nested === 'object' ? { ...record, ...nested } : record
  ) as Record<string, unknown>;
  const { resultId, kind, title } = source;
  if (
    typeof resultId !== 'string' ||
    (kind !== 'table' && kind !== 'summary' && kind !== 'report')
  ) {
    return null;
  }
  return {
    resultId,
    kind,
    title: typeof title === 'string' ? title : '',
    stats: (source.stats as Partial<TaskStats> | undefined) ?? undefined,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : fallbackTime,
  };
}

/** Every task result attached in this conversation, oldest first, each result once. */
export function collectTaskOutputs(messages: TMessage[] | undefined): TaskOutput[] {
  const seen = new Set<string>();
  const outputs: TaskOutput[] = [];
  for (const message of messages ?? []) {
    for (const attachment of message.attachments ?? []) {
      const output = toTaskOutput(attachment, message.createdAt as string | undefined);
      if (output == null || seen.has(output.resultId)) {
        continue;
      }
      seen.add(output.resultId);
      outputs.push(output);
    }
  }
  return outputs;
}

export type TaskFile = { file_id: string; filename: string };

/** Distinct files the user attached anywhere in the conversation. */
export function collectConversationFiles(messages: TMessage[] | undefined): TaskFile[] {
  const files = new Map<string, TaskFile>();
  for (const message of messages ?? []) {
    for (const file of message.files ?? []) {
      if (file.file_id == null || files.has(file.file_id)) {
        continue;
      }
      files.set(file.file_id, { file_id: file.file_id, filename: file.filename ?? file.file_id });
    }
  }
  return [...files.values()];
}

/** 「HH:MM」, the time stamp the wireframe puts on outputs and result footers. */
export function formatTaskTime(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
