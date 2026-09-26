import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { TaskTools } from 'librechat-data-provider';
import type { Agents, TAttachment, TaskToolName } from 'librechat-data-provider';
import type { TaskStepState } from '~/components/Task/taskState';
import type { TaskResultAttachment } from './api';
import TaskViewApproval, { TaskViewRan, viewLabel } from './TaskViewApproval';
import { stepStates, taskPlanPosition } from '~/components/Task/taskState';
import TaskSchemaApproval, { TaskSchemaRan } from './TaskSchemaApproval';
import { taskProgressByToolCallId } from '~/store/task';
import { TASK_STAGES, parseTaskArgs } from './stages';
import TaskResultCard from './TaskResultCard';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const TASK_RESULT_ATTACHMENT = 'task_result';

const STEP_ICON: Record<TaskStepState, string> = { done: '✓', now: '▶', stopped: '✕', todo: '○' };

function taskResultsOf(attachments: TAttachment[] | undefined): TaskResultAttachment[] {
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

/**
 * Card for `extract_table`, `summarize_documents` and `write_report` calls: the plan
 * steps, the field or perspective picker while the call waits for approval (kept
 * read-only once it ran), and the result message once the tool returns.
 */
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
  /** Unused since the task panel alone opens live results; `Part` still passes it. */
  isSubmitting?: boolean;
}) {
  const localize = useLocalize();
  const args = useMemo(() => parseTaskArgs(rawArgs), [rawArgs]);
  const progress = useAtomValue(taskProgressByToolCallId(toolCallId));
  const results = useMemo(() => taskResultsOf(attachments), [attachments]);
  const stages = TASK_STAGES[toolName];
  const finished = (output?.length ?? 0) > 0;
  const awaitingApproval = approval != null && !finished;
  /** A returned call with a saved result ran past its confirmation; a rejected or
   *  failed one has no result, so no "ran" card claims otherwise. */
  const ran = finished && results.length > 0;

  const { current, currentState } = taskPlanPosition(
    stages,
    { finished, hasResult: ran, awaitingApproval, hadApproval: approval != null },
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
      {ran && toolName === TaskTools.extract_table && <TaskSchemaRan args={args} />}
      {ran && toolName === TaskTools.summarize_documents && <TaskViewRan args={args} />}
      {results.map((result) => (
        <TaskResultCard key={result.resultId} result={result} />
      ))}
    </div>
  );
}
