import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { TaskTools } from 'librechat-data-provider';
import type { Agents, TAttachment, TaskToolName } from 'librechat-data-provider';
import type { TaskStepState } from '~/components/Task/taskState';
import type { TaskResultAttachment } from './api';
import { isBlockedTaskOutput, stepStates, taskPlanPosition } from '~/components/Task/taskState';
import { taskDecisionByToolCallId, taskProgressByToolCallId } from '~/store/task';
import TaskViewApproval, { TaskViewRan, viewLabel } from './TaskViewApproval';
import TaskSchemaApproval, { TaskSchemaRan } from './TaskSchemaApproval';
import { TASK_STAGES, parseTaskArgs } from './stages';
import TaskResultCard from './TaskResultCard';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const TASK_RESULT_ATTACHMENT = 'task_result';

const STEP_ICON: Record<TaskStepState, string> = { done: '✓', now: '▶', stopped: '✕', todo: '○' };

export function taskResultsOf(attachments: TAttachment[] | undefined): TaskResultAttachment[] {
  const results: TaskResultAttachment[] = [];
  for (const attachment of attachments ?? []) {
    const record = attachment as unknown as Record<string, unknown>;
    const payload = record[TASK_RESULT_ATTACHMENT] as TaskResultAttachment | undefined;
    if (record.type === TASK_RESULT_ATTACHMENT && payload?.resultId != null) {
      results.push(payload);
    }
  }
  return results;
}

export default function TaskPlanCard({
  toolName,
  toolCallId,
  args: rawArgs,
  output,
  approval,
  attachments,
}: {
  toolName: TaskToolName;
  toolCallId: string;
  args: unknown;
  output?: string | null;
  approval?: Agents.ToolCall['approval'];
  attachments?: TAttachment[];
  /** Part가 아직 전달하지만, 라이브 결과 패널은 task panel이 열므로 사용하지 않는다. */
  isSubmitting?: boolean;
}) {
  const localize = useLocalize();
  const args = useMemo(() => parseTaskArgs(rawArgs), [rawArgs]);
  const progress = useAtomValue(taskProgressByToolCallId(toolCallId));
  const results = useMemo(() => taskResultsOf(attachments), [attachments]);
  const stages = TASK_STAGES[toolName];
  const finished = (output?.length ?? 0) > 0;
  const awaitingApproval = approval != null && !finished;
  /** 저장된 결과가 있으면 확인 후 실행했고, 결과가 없으면 실행하지 않은 상태다. */
  const ran = finished && results.length > 0;
  /** 반환된 호출에는 `approval`이 남지 않아 결정 기록이나 차단 응답으로 취소를 판별한다. */
  const decision = useAtomValue(taskDecisionByToolCallId(toolCallId));
  const cancelled = finished && !ran && (decision === 'reject' || isBlockedTaskOutput(output));

  const { current, currentState } = taskPlanPosition(
    stages,
    { finished, hasResult: ran, awaitingApproval, hadApproval: approval != null || cancelled },
    progress,
  );
  const states = stepStates(stages.length, current, currentState);

  const stepLabel = (index: number) => {
    const label = localize(stages[index].label);
    if (index !== current || progress == null || progress.stage !== stages[index].id) {
      return label;
    }
    const view =
      typeof args.view === 'string' && progress.stage === 'summarize'
        ? viewLabel(args.view, localize)
        : '';
    const count = progress.total > 0 ? `${progress.done}/${progress.total}` : '';
    return [label, view, count].filter(Boolean).join(' · ');
  };

  return (
    <div className="my-1.5 flex flex-col" data-testid="task-plan-card" data-tool={toolName}>
      <div className="rounded-xl border border-border-light bg-surface-secondary px-3.5 py-3">
        <h4 className="mb-2 text-[0.8125rem] font-medium text-text-secondary">
          {localize('com_ui_task_plan_title')}
        </h4>
        <ol className="flex flex-col">
          {stages.map((stage, index) => {
            const state = states[index];
            const now = state === 'now';
            return (
              <li
                key={stage.id}
                data-state={state}
                className={cn(
                  'flex items-center gap-2 py-0.5 text-[0.90625rem]',
                  now ? 'text-text-primary' : 'text-text-secondary',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'w-4 text-center font-mono text-[0.8125rem]',
                    state === 'done' && 'text-status-success-strong',
                    now && 'text-status-warning-strong',
                  )}
                >
                  {STEP_ICON[state]}
                </span>
                {`${index + 1}. ${stepLabel(index)}`}
              </li>
            );
          })}
        </ol>
      </div>
      {awaitingApproval && toolName === TaskTools.extract_table && (
        <TaskSchemaApproval approval={approval} toolCallId={toolCallId} args={args} />
      )}
      {awaitingApproval && toolName === TaskTools.summarize_documents && (
        <TaskViewApproval approval={approval} toolCallId={toolCallId} args={args} />
      )}
      {(ran || cancelled) && toolName === TaskTools.extract_table && (
        <TaskSchemaRan args={args} cancelled={cancelled} />
      )}
      {(ran || cancelled) && toolName === TaskTools.summarize_documents && (
        <TaskViewRan args={args} cancelled={cancelled} />
      )}
      {results.map((result) => (
        <TaskResultCard key={result.resultId} result={result} />
      ))}
    </div>
  );
}
