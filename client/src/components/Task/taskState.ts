import { ContentTypes, TaskTools } from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  TaskStats,
  TaskToolName,
  TaskProgressEvent,
} from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';

/**
 * The plan steps each task tool walks through, in order. `id` is the `stage`
 * the server sends in `on_task_progress`, so the tool processors and this list
 * must agree on the same ids.
 */
export const TASK_STAGES: Record<TaskToolName, { id: string; label: TranslationKeys }[]> = {
  [TaskTools.extract_table]: [
    { id: 'prepare', label: 'com_ui_task_stage_prepare' },
    { id: 'fields', label: 'com_ui_task_stage_confirm_fields' },
    { id: 'extract', label: 'com_ui_task_stage_extract_all' },
    { id: 'aggregate', label: 'com_ui_task_stage_aggregate' },
    { id: 'save', label: 'com_ui_task_stage_save' },
  ],
  [TaskTools.summarize_documents]: [
    { id: 'prepare', label: 'com_ui_task_stage_prepare' },
    { id: 'view', label: 'com_ui_task_stage_confirm_view' },
    { id: 'summarize', label: 'com_ui_task_stage_summarize' },
    { id: 'merge', label: 'com_ui_task_stage_merge' },
    { id: 'save', label: 'com_ui_task_stage_save' },
  ],
  [TaskTools.write_report]: [
    { id: 'prepare', label: 'com_ui_task_stage_prepare' },
    { id: 'extract', label: 'com_ui_task_stage_extract' },
    { id: 'fill', label: 'com_ui_task_stage_compose' },
    { id: 'render', label: 'com_ui_task_stage_render' },
    { id: 'save', label: 'com_ui_task_stage_save' },
  ],
};

const TASK_TOOL_NAMES = new Set<string>(Object.values(TaskTools));

export const isTaskToolName = (name: string | undefined): name is TaskToolName =>
  name != null && TASK_TOOL_NAMES.has(name);

export type TaskToolCallState = {
  toolCallId: string;
  name: TaskToolName;
  awaitingApproval: boolean;
  finished: boolean;
};

/** The last task tool call in the conversation; the progress section follows only that one. */
export function findLatestTaskToolCall(messages: TMessage[] | undefined): TaskToolCallState | null {
  let latest: TaskToolCallState | null = null;
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
      latest = {
        toolCallId: toolCall.id ?? '',
        name: toolCall.name,
        awaitingApproval: toolCall.approval != null && !finished,
        finished,
      };
    }
  }
  return latest;
}

export type TaskStepView = { id: string; label: TranslationKeys; state: 'done' | 'now' | 'todo' };

/**
 * Where the plan stands. A finished call has every step done; a call paused on
 * its approval card sits on the second step (field or view confirmation);
 * otherwise the latest progress event names the step, and before any event the
 * first step is current.
 */
export function resolveTaskSteps(
  call: TaskToolCallState,
  progress: TaskProgressEvent | null,
): TaskStepView[] {
  const stages = TASK_STAGES[call.name];
  let current = 0;
  if (call.finished) {
    current = stages.length;
  } else if (call.awaitingApproval) {
    current = 1;
  } else if (progress != null) {
    const index = stages.findIndex((stage) => stage.id === progress.stage);
    current = index >= 0 ? index : 0;
  }
  const stateAt = (index: number): TaskStepView['state'] => {
    if (index < current) {
      return 'done';
    }
    return index === current ? 'now' : 'todo';
  };
  return stages.map((stage, index) => ({ ...stage, state: stateAt(index) }));
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

const TASK_RESULT_ATTACHMENT = 'task_result';

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
