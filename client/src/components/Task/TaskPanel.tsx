import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { useAtom, useAtomValue } from 'jotai';
import type { TMessage, TaskProgressEvent } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { TaskOutput, TaskStepView, TaskToolCallState } from './taskState';
import type { TranslationKeys } from '~/hooks';
import {
  collectConversationFiles,
  collectTaskOutputs,
  findLatestTaskToolCall,
  formatTaskTime,
  resolveTaskSteps,
  isAwaitingTaskApproval,
} from './taskState';
import { useActiveJobStatus, useGetMessagesByConvoId, useMCPServersQuery } from '~/data-provider';
import { taskDecisionByToolCallId, taskPanelState, taskProgressByToolCallId } from '~/store/task';
import { getAgentServerNames } from '~/components/Chat/Input/useAgentConnectorSelection';
import useAgentToolPermissions from '~/hooks/Agents/useAgentToolPermissions';
import { useTaskResultQuery } from '~/data-provider/Tasks/queries';
import { ephemeralAgentByConvoId } from '~/store/agents';
import { mcpValuesAtomFamily } from '~/store/mcp';
import { isEphemeralAgent } from '~/common';
import TaskDocView from './TaskDocView';
import { useLocalize } from '~/hooks';
import TaskTable from './TaskTable';
import { cn } from '~/utils';
import store from '~/store';

type PanelStatus = 'wait' | 'run' | 'ok' | 'stopped';

const STATUS_LABEL: Record<PanelStatus, TranslationKeys> = {
  wait: 'com_ui_convo_awaiting_approval',
  run: 'com_ui_task_status_running',
  ok: 'com_ui_task_status_done',
  stopped: 'com_ui_task_status_stopped',
};

const STATUS_DOT: Record<PanelStatus, string> = {
  wait: 'bg-status-error-strong',
  run: 'bg-status-warning-strong',
  ok: 'bg-status-success',
  stopped: 'bg-border-heavy',
};

/** `doc` and `hwp` are file-kind tags shown as is; only the table tag is a word to translate. */
const OUTPUT_ICON: Record<TaskOutput['kind'], { label?: string; className: string }> = {
  table: { className: 'bg-surface-brand-subtle text-accent-primary' },
  summary: { label: 'doc', className: 'bg-status-success-subtle text-status-success' },
  report: { label: 'hwp', className: 'bg-status-warning-subtle text-status-warning-strong' },
};

const selectMessages = (messages: TMessage[]) => messages;

function Section({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border-light px-[18px] pb-4 pt-3.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="mb-2.5 flex w-full items-center gap-2 text-left text-[12.5px] font-bold tracking-[.06em] text-text-secondary"
      >
        <span aria-hidden="true" className="w-3 text-[11px] text-text-muted">
          {open ? '▾' : '▸'}
        </span>
        {title}
        {count != null && (
          <span className="font-medium tracking-normal text-text-muted">{count}</span>
        )}
      </button>
      {open && children}
    </section>
  );
}

function ProgressSection({
  call,
  awaiting,
  steps,
  progress,
  open,
  onToggle,
}: {
  call: TaskToolCallState;
  /** From `isAwaitingTaskApproval`, not the call's own flag. */
  awaiting: boolean;
  steps: TaskStepView[];
  progress: TaskProgressEvent | null;
  open: boolean;
  onToggle: () => void;
}) {
  const localize = useLocalize();
  const doneSteps = steps.filter((step) => step.state === 'done').length;
  const liveProgress = !call.finished && !awaiting ? progress : null;
  const percent =
    liveProgress != null
      ? Math.round((100 * liveProgress.done) / Math.max(1, liveProgress.total))
      : Math.round((100 * doneSteps) / Math.max(1, steps.length));

  return (
    <Section
      title={localize('com_ui_task_progress')}
      count={`${doneSteps}/${steps.length}`}
      open={open}
      onToggle={onToggle}
    >
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mb-2.5 mt-0.5 h-1.5 overflow-hidden rounded-[3px] bg-border-light"
      >
        <i
          className="block h-full bg-accent-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ol>
        {steps.map((step, index) => (
          <li
            key={step.id}
            data-state={step.state}
            className={cn(
              'flex items-start gap-2.5 rounded-md px-2 py-[7px] text-[13.5px] leading-[1.45]',
              step.state === 'now'
                ? 'bg-surface-brand-subtle font-semibold text-text-primary'
                : 'text-text-muted',
            )}
          >
            <span
              className={cn(
                'mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] font-mono text-[11px]',
                step.state === 'done' && 'border-status-success bg-status-success text-white',
                step.state === 'now' && 'border-accent-primary bg-accent-primary text-white',
                step.state === 'todo' && 'border-border-medium text-text-muted',
                step.state === 'stopped' && 'border-border-heavy text-text-secondary',
              )}
            >
              {step.state === 'done' && '✓'}
              {step.state === 'stopped' && '✕'}
              {(step.state === 'now' || step.state === 'todo') && index + 1}
            </span>
            <span>
              {localize(step.label)}
              {step.state === 'now' && liveProgress?.stage === step.id && (
                <span className="mt-0.5 block text-xs font-normal text-text-muted">
                  {liveProgress.label} · {liveProgress.done}/{liveProgress.total}
                </span>
              )}
              {step.state === 'now' && awaiting && (
                <span className="mt-0.5 block text-xs font-normal text-text-muted">
                  {localize('com_ui_task_waiting_approval')}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function outputMeta(output: TaskOutput, localize: ReturnType<typeof useLocalize>) {
  const meta =
    output.kind === 'table'
      ? localize('com_ui_task_output_table_meta', {
          rows: output.stats?.docs ?? 0,
          none: output.stats?.none ?? 0,
        })
      : localize('com_ui_task_output_doc_meta', { count: output.stats?.reflected ?? 0 });
  const time = formatTaskTime(output.createdAt);
  return time ? `${meta} · ${time}` : meta;
}

function OutputsSection({
  outputs,
  open,
  onToggle,
  onOpen,
}: {
  outputs: TaskOutput[];
  open: boolean;
  onToggle: () => void;
  onOpen: (resultId: string) => void;
}) {
  const localize = useLocalize();
  return (
    <Section
      title={localize('com_ui_task_outputs')}
      count={outputs.length}
      open={open}
      onToggle={onToggle}
    >
      {outputs.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">{localize('com_ui_task_outputs_empty')}</p>
      ) : (
        <ul>
          {outputs.map((output) => {
            const icon = OUTPUT_ICON[output.kind];
            return (
              <li key={output.resultId}>
                <button
                  type="button"
                  onClick={() => onOpen(output.resultId)}
                  data-testid="task-output-row"
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13.5px] hover:bg-surface-hover"
                >
                  <span
                    className={cn(
                      'inline-flex size-[30px] shrink-0 items-center justify-center rounded-md font-mono text-[11px]',
                      icon.className,
                    )}
                  >
                    {icon.label ?? localize('com_ui_task_icon_table')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate font-semibold text-text-primary">{output.title}</b>
                    <span className="text-xs text-text-muted">{outputMeta(output, localize)}</span>
                  </span>
                  <span className="text-xs text-text-muted">{localize('com_ui_task_open')} ›</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function ContextRow({
  icon,
  text,
  status,
  muted,
}: {
  icon: string;
  text: ReactNode;
  status?: ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13.5px]',
        muted ? 'text-text-muted' : 'text-text-secondary',
      )}
    >
      <span aria-hidden="true" className="w-[18px] text-center text-[13px] text-text-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {status != null && <span className="text-xs text-text-muted">{status}</span>}
    </div>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 ml-2 mt-2.5 text-[11.5px] font-semibold tracking-[.04em] text-text-muted first:mt-0">
      {children}
    </div>
  );
}

function ContextSection({
  conversationId,
  messages,
  isTaskMode,
  open,
  onToggle,
}: {
  conversationId: string;
  messages: TMessage[] | undefined;
  isTaskMode: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const localize = useLocalize();
  const [filesOpen, setFilesOpen] = useState(false);
  const files = useMemo(() => collectConversationFiles(messages), [messages]);
  const { data: servers } = useMCPServersQuery({ enabled: false });
  const chatSelection = useAtomValue(mcpValuesAtomFamily(conversationId));
  const ephemeralAgent = useRecoilValue(ephemeralAgentByConvoId(conversationId));
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const agentId = conversation?.agent_id;
  const isSavedAgent = agentId != null && agentId !== '' && !isEphemeralAgent(agentId);
  const { tools, agent } = useAgentToolPermissions(isSavedAgent ? agentId : null, ephemeralAgent);
  const modelName = agent?.model ?? conversation?.model ?? '';

  /** Mirrors the composer: a saved agent's own connectors, less those switched off in this chat;
   *  otherwise the chat menu's servers and the chat's selection. */
  const serverRows = useMemo(() => {
    const catalog = Object.values(servers ?? {});
    if (isSavedAgent) {
      const carried = getAgentServerNames(
        tools,
        catalog.map((server) => server.serverName),
      );
      const disabled = new Set(ephemeralAgent?.disabled_mcp ?? []);
      return catalog
        .filter((server) => carried.has(server.serverName))
        .map((server) => ({ server, on: !disabled.has(server.serverName) }));
    }
    return catalog
      .filter((server) => server.chatMenu !== false && !server.consumeOnly)
      .map((server) => ({ server, on: chatSelection.includes(server.serverName) }));
  }, [chatSelection, ephemeralAgent?.disabled_mcp, isSavedAgent, servers, tools]);

  return (
    <Section title={localize('com_ui_task_context')} open={open} onToggle={onToggle}>
      <SubHeading>{localize('com_ui_task_files')}</SubHeading>
      {files.length === 0 ? (
        <ContextRow icon="↑" text={localize('com_ui_task_files_none')} muted />
      ) : (
        <>
          <button
            type="button"
            className="block w-full text-left"
            aria-expanded={filesOpen}
            onClick={() => setFilesOpen((value) => !value)}
          >
            <ContextRow
              icon="▦"
              text={localize('com_ui_task_files_mine', { count: files.length })}
              status={localize('com_ui_task_files_all_used')}
            />
          </button>
          {filesOpen && (
            <ul className="ml-7">
              {files.map((file) => (
                <li key={file.file_id}>
                  <ContextRow
                    icon="·"
                    text={file.filename}
                    status={localize('com_ui_task_file_ready')}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {serverRows.length > 0 && (
        <>
          <SubHeading>{localize('com_ui_task_mcp_servers')}</SubHeading>
          {serverRows.map(({ server, on }) => {
            return (
              <ContextRow
                key={server.serverName}
                icon="▤"
                text={server.title ?? server.serverName}
                status={localize(on ? 'com_ui_task_on' : 'com_ui_task_off')}
                muted={!on}
              />
            );
          })}
        </>
      )}
      <SubHeading>{localize('com_ui_task_model')}</SubHeading>
      <ContextRow
        icon="◇"
        text={modelName}
        status={localize(isTaskMode ? 'com_ui_task_mode_task' : 'com_ui_task_mode_chat')}
      />
    </Section>
  );
}

function ResultView({ resultId, onBack }: { resultId: string; onBack: () => void }) {
  const localize = useLocalize();
  const { data: result, isLoading, isError } = useTaskResultQuery(resultId);
  return (
    <div className="flex min-h-0 flex-1 flex-col px-[18px] py-3.5">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-[12.5px] text-text-secondary hover:text-text-primary"
        >
          ‹ {localize('com_ui_task_overview')}
        </button>
        {result && (
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-text-primary">
            {result.title}
          </span>
        )}
      </div>
      {isLoading && <p className="text-sm text-text-muted">{localize('com_ui_loading')}</p>}
      {isError && (
        <p role="alert" className="text-sm text-status-error">
          {localize('com_ui_task_result_error')}
        </p>
      )}
      {result?.kind === 'table' && <TaskTable result={result} />}
      {result != null && result.kind !== 'table' && <TaskDocView result={result} />}
    </div>
  );
}

/** The right-hand task panel: progress, outputs, references, and the result screens they open. */
export default function TaskPanel({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const [panel, setPanel] = useAtom(taskPanelState);
  const [sections, setSections] = useState({ progress: true, outputs: true, context: true });
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));
  const jobStatus = useActiveJobStatus(conversationId);
  const { data: messages } = useGetMessagesByConvoId(conversationId, {
    enabled: false,
    select: selectMessages,
  });

  const call = useMemo(() => findLatestTaskToolCall(messages), [messages]);
  const outputs = useMemo(() => collectTaskOutputs(messages), [messages]);
  const progress = useAtomValue(taskProgressByToolCallId(call?.toolCallId ?? ''));
  const decision = useAtomValue(taskDecisionByToolCallId(call?.toolCallId ?? ''));
  /** A cancel the server took stops the plan at the confirmation, as on the card. */
  const steps = useMemo(
    () =>
      call
        ? resolveTaskSteps(decision === 'reject' ? { ...call, hadApproval: true } : call, progress)
        : [],
    [call, decision, progress],
  );
  const awaiting = call != null && isAwaitingTaskApproval(call, progress, decision != null);

  let status: PanelStatus = 'ok';
  /** A live task call says itself whether it waits; the polled job list can still
   *  report the pause for a few seconds after the run went on. */
  if (awaiting || (jobStatus === 'requires_action' && (call == null || call.finished))) {
    status = 'wait';
  } else if (jobStatus != null || isSubmitting) {
    status = 'run';
  } else if (call?.finished === true && !call.hasResult) {
    status = 'stopped';
  }

  const toggle = (name: keyof typeof sections) => () =>
    setSections((current) => ({ ...current, [name]: !current[name] }));

  const showResult = panel.view === 'result' && panel.resultId != null;

  return (
    <aside
      aria-label={localize('com_ui_task_panel')}
      className="flex h-full flex-col overflow-hidden border-l border-border-light bg-surface-primary"
    >
      <header className="flex min-h-14 shrink-0 items-center gap-2.5 border-b border-border-light px-[18px] py-2.5 text-[14.5px] font-semibold leading-[1.35]">
        <span className="min-w-0 flex-1 truncate text-text-primary">
          {conversation?.title ?? ''}
        </span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border-light px-2.5 py-[3px] text-xs font-medium text-text-muted">
          <span aria-hidden="true" className={cn('size-[7px] rounded-full', STATUS_DOT[status])} />
          {localize(STATUS_LABEL[status])}
        </span>
        <button
          type="button"
          onClick={() => setPanel((current) => ({ ...current, open: false }))}
          aria-label={localize('com_ui_close')}
          className="rounded-md p-1 text-text-muted hover:bg-surface-hover"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>
      {showResult ? (
        <ResultView
          resultId={panel.resultId as string}
          onBack={() => setPanel((current) => ({ ...current, view: 'overview', resultId: null }))}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {call && (
            <ProgressSection
              call={call}
              awaiting={awaiting}
              steps={steps}
              progress={progress}
              open={sections.progress}
              onToggle={toggle('progress')}
            />
          )}
          <OutputsSection
            outputs={outputs}
            open={sections.outputs}
            onToggle={toggle('outputs')}
            onOpen={(resultId) =>
              setPanel((current) => ({ ...current, open: true, view: 'result', resultId }))
            }
          />
          <ContextSection
            conversationId={conversationId}
            messages={messages}
            isTaskMode={call != null}
            open={sections.context}
            onToggle={toggle('context')}
          />
        </div>
      )}
    </aside>
  );
}
