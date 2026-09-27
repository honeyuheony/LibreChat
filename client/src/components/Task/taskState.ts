import { Constants, ContentTypes, TaskTools } from 'librechat-data-provider';
import type {
  Agents,
  TMessage,
  TaskStats,
  TaskToolName,
  TaskDocResult,
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
  /** `task_result` 첨부가 이 호출을 가리킨다. 거절·실패했거나 할 일이 없던 호출도 글을
   *  돌려주므로 `finished` 만으로는 끝까지 돌았는지 알 수 없다. */
  hasResult: boolean;
  /** 실행 전에 사용자 확인을 기다리며 멈춘 적이 있다. */
  hadApproval: boolean;
};

const TASK_RESULT_ATTACHMENT = 'task_result';

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
 * 거절했거나 정책이 막은 호출에는 SDK 가 실행 대신 `Blocked: <이유>` 를 답한다.
 * 끝난 호출에는 `approval` 이 남지 않으므로, 다시 불러온 뒤에는 이 답으로 확인 단계에서 멈췄음을 안다.
 */
export function isBlockedTaskOutput(output: string | null | undefined): boolean {
  return typeof output === 'string' && /^(?:Error: )?Blocked:/.test(output.trim());
}

/** 대화의 마지막 작업 도구 호출. 진행 칸은 이 호출만 따라간다. */
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
 * 결과 없이 끝난 호출이 멈춘 단계. 진행 이벤트가 닿은 마지막 단계, 없으면 확인에서 멈췄을 때
 * (거절했거나 바로 뒤에 멈춤) 확인 단계, 그것도 아니면 첫 단계다.
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

export type TaskPlanFacts = Pick<
  TaskToolCallState,
  'awaitingApproval' | 'finished' | 'hasResult' | 'hadApproval'
>;

/**
 * 계획이 서 있는 단계와 그 단계가 진행 중인지 멈췄는지. 결과를 저장한 호출은 모든 단계를 지났고,
 * 결과 없이 돌아온 호출(거절·실패·할 일 없음)은 닿은 단계에서 멈춘다. 그 밖에는 마지막 진행 이벤트와,
 * 확인을 기다리는 동안이면 확인 단계 가운데 더 뒤의 것이다.
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

/** 패널의 계획 목록. 메시지의 계획 카드와 같은 규칙으로 단계를 놓는다. */
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
 * 호출이 아직 확인 카드를 기다리는지. `approval` 은 호출이 돌아올 때까지 남으므로,
 * 결정을 보냈거나 진행이 확인 단계를 지났으면 실행이 이어진 것으로 본다.
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

/** `task_result` 첨부가 싣는 값. 본문은 서버에 있다. */
export type TaskOutput = {
  resultId: string;
  kind: TaskOutputKind;
  title: string;
  stats?: Partial<TaskStats>;
  createdAt?: string;
};

/** 다른 도구처럼 값이 `task_result` 키 아래에 들어 있을 수도 있어 첨부 자체와 그 키를 함께 읽는다. */
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

/** 대화에 붙은 작업 결과를 오래된 것부터 하나씩 모은다. */
export function collectTaskOutputs(messages: TMessage[] | undefined): TaskOutput[] {
  const seen = new Set<string>();
  const outputs: TaskOutput[] = [];
  for (const message of messages ?? []) {
    for (const attachment of message.attachments ?? []) {
      const output = toTaskOutput(attachment, message.createdAt);
      if (output == null || seen.has(output.resultId)) {
        continue;
      }
      seen.add(output.resultId);
      outputs.push(output);
    }
  }
  return outputs;
}

/** 요약·보고서가 인용한 근거(각주) 수. */
export function countTaskFootnotes(result: Pick<TaskDocResult, 'footnotes'>): number {
  return new Set(result.footnotes.map((footnote) => footnote.n)).size;
}

export type TaskActivity = {
  id: string;
  name: string;
  /** `<도구>_mcp_<서버>` 키에서 떼어 낸 MCP 서버 이름. */
  serverName?: string;
  createdAt?: string;
};

/** 패널 「활동」 기록: 대화의 모든 도구 호출을 순서대로 모은다. */
export function collectToolActivity(messages: TMessage[] | undefined): TaskActivity[] {
  const activity: TaskActivity[] = [];
  for (const message of messages ?? []) {
    for (const part of message.content ?? []) {
      if (part?.type !== ContentTypes.TOOL_CALL) {
        continue;
      }
      const toolCall = (part as Agents.ToolCallContent).tool_call;
      if (!toolCall?.name) {
        continue;
      }
      const [name, serverName] = toolCall.name.split(Constants.mcp_delimiter);
      activity.push({
        id: toolCall.id ?? `${message.messageId}-${activity.length}`,
        name: serverName ? name : toolCall.name,
        serverName: serverName || undefined,
        createdAt: message.createdAt,
      });
    }
  }
  return activity;
}

export type TaskFile = { file_id: string; filename: string };

/** 사용자가 대화 어디에서든 붙인 파일을 겹치지 않게 모은다. */
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

/** 결과물 목록과 결과 화면 아래에 적는 「HH:MM」 시각. */
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
