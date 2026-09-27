import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { Button } from '@librechat/client';
import { useAtom, useAtomValue } from 'jotai';
import { normalizeServerName } from 'librechat-data-provider';
import type { TMessage, TaskProgressEvent, MCPServersListResponse } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { TaskActivity, TaskOutput, TaskStepView, TaskToolCallState } from './taskState';
import {
  formatTaskTime,
  collectTaskOutputs,
  countTaskFootnotes,
  collectToolActivity,
  collectConversationFiles,
} from './taskState';
import { getAgentServerNames } from '~/components/Chat/Input/useAgentConnectorSelection';
import useTaskRunState, { TASK_STATUS_DOT, TASK_STATUS_LABEL } from './useTaskRunState';
import { useGetMessagesByConvoId, useMCPServersQuery } from '~/data-provider';
import useAgentToolPermissions from '~/hooks/Agents/useAgentToolPermissions';
import { MyFilesModal } from '~/components/Chat/Input/Files/MyFilesModal';
import { useTaskResultQuery } from '~/data-provider/Tasks/queries';
import { ephemeralAgentByConvoId } from '~/store/agents';
import { shortResultTitle } from '~/utils/results';
import { mcpValuesAtomFamily } from '~/store/mcp';
import { taskPanelState } from '~/store/task';
import { isEphemeralAgent } from '~/common';
import TaskDocView from './TaskDocView';
import { useLocalize } from '~/hooks';
import TaskTable from './TaskTable';
import { cn } from '~/utils';
import store from '~/store';

/** `doc`·`hwp` 는 파일 종류 표시라 그대로 쓰고, 표만 번역할 단어다. */
const OUTPUT_ICON: Record<TaskOutput['kind'], { label?: string; className: string }> = {
  table: { className: 'bg-surface-brand-subtle text-accent-primary' },
  summary: { label: 'doc', className: 'bg-status-success-subtle text-status-success' },
  report: { label: 'hwp', className: 'bg-status-warning-subtle text-status-warning-strong' },
};

const selectMessages = (messages: TMessage[]) => messages;

function Section({
  title,
  count,
  action,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: ReactNode;
  /** 제목 오른쪽 링크. 펼침 단추 안이 아니라 옆에 둔다. */
  action?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border-light px-[18px] pb-4 pt-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12.5px] font-bold tracking-[.06em] text-text-secondary"
        >
          <span aria-hidden="true" className="w-3 text-[11px] text-text-muted">
            {open ? '▾' : '▸'}
          </span>
          {title}
          {count != null && (
            <span className="font-medium tracking-normal text-text-muted">{count}</span>
          )}
        </button>
        {action}
      </div>
      {open && children}
    </section>
  );
}

function HeadingLink({
  onClick,
  expanded,
  children,
}: {
  onClick: () => void;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="pill"
      onClick={onClick}
      aria-expanded={expanded}
      className="h-auto px-0 text-[12.5px] font-medium text-link hover:bg-transparent hover:text-link-hover"
    >
      {children}
    </Button>
  );
}

/** 도구 키에는 정규화한 서버 이름이 들어 있어 그 이름으로 제목을 찾는다. */
function useServerTitles(servers: MCPServersListResponse | undefined): Map<string, string> {
  return useMemo(() => {
    const titles = new Map<string, string>();
    for (const [serverName, config] of Object.entries(servers ?? {})) {
      titles.set(normalizeServerName(serverName), config.title ?? serverName);
    }
    return titles;
  }, [servers]);
}

function ActivityLog({
  label,
  activity,
  titles,
}: {
  label: string;
  activity: TaskActivity[];
  titles: Map<string, string>;
}) {
  return (
    <ol
      aria-label={label}
      className="mt-2 flex max-h-[180px] flex-col gap-1 overflow-auto border-t border-dashed border-border-light pt-2 text-[12.5px] text-text-secondary"
    >
      {activity.map((entry) => (
        <li key={entry.id} className="flex items-start gap-2 leading-normal">
          <span className="w-[42px] shrink-0 pt-0.5 font-mono text-[11.5px] text-text-muted">
            {formatTaskTime(entry.createdAt)}
          </span>
          <span className="min-w-0 break-words">
            {entry.serverName != null
              ? `${entry.name} · ${titles.get(entry.serverName) ?? entry.serverName}`
              : entry.name}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ProgressSection({
  call,
  awaiting,
  steps,
  progress,
  activity,
  serverTitles,
  open,
  onToggle,
}: {
  call: TaskToolCallState;
  /** 호출 자체의 값이 아니라 `isAwaitingTaskApproval` 의 결과다. */
  awaiting: boolean;
  steps: TaskStepView[];
  progress: TaskProgressEvent | null;
  activity: TaskActivity[];
  serverTitles: Map<string, string>;
  open: boolean;
  onToggle: () => void;
}) {
  const localize = useLocalize();
  const [logOpen, setLogOpen] = useState(false);
  const activityLabel = localize('com_ui_task_activity', { count: activity.length });
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
      action={
        activity.length > 0 && (
          <HeadingLink expanded={logOpen} onClick={() => setLogOpen((value) => !value)}>
            {logOpen ? localize('com_ui_task_activity_close') : activityLabel}
          </HeadingLink>
        )
      }
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
      {logOpen && <ActivityLog label={activityLabel} activity={activity} titles={serverTitles} />}
    </Section>
  );
}

/**
 * 결과물 행의 둘째 줄. 문서의 근거는 각주이고 각주는 저장된 결과에만 있으므로(`stats.reflected` 는
 * 문서 수다) 결과를 읽은 뒤에 수를 보인다. 결과 화면·메시지 카드와 같은 요청을 쓴다.
 */
function OutputMeta({ output }: { output: TaskOutput }) {
  const localize = useLocalize();
  const { data: result } = useTaskResultQuery(output.kind === 'table' ? null : output.resultId);
  let meta: string;
  if (output.kind === 'table') {
    meta = localize('com_ui_task_output_table_meta', {
      rows: output.stats?.docs ?? 0,
      none: output.stats?.none ?? 0,
    });
  } else if (result != null && result.kind !== 'table') {
    meta = localize('com_ui_task_output_doc_meta', { count: countTaskFootnotes(result) });
  } else {
    meta = localize('com_ui_task_output_doc');
  }
  const time = formatTaskTime(output.createdAt);
  return <span className="text-xs text-text-muted">{time ? `${meta} · ${time}` : meta}</span>;
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
                    <b className="block truncate font-semibold text-text-primary">
                      {shortResultTitle(
                        {
                          kind: output.kind,
                          title: output.title,
                          rows: output.stats?.docs,
                        },
                        (rows) => localize('com_ui_task_count', { 0: String(rows) }),
                      )}
                    </b>
                    <OutputMeta output={output} />
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
  servers,
  isTaskMode,
  open,
  onToggle,
}: {
  conversationId: string;
  messages: TMessage[] | undefined;
  servers: MCPServersListResponse | undefined;
  isTaskMode: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const localize = useLocalize();
  const [filesOpen, setFilesOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const manageRef = useRef<HTMLDivElement>(null);
  const files = useMemo(() => collectConversationFiles(messages), [messages]);
  const chatSelection = useAtomValue(mcpValuesAtomFamily(conversationId));
  const ephemeralAgent = useRecoilValue(ephemeralAgentByConvoId(conversationId));
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const agentId = conversation?.agent_id;
  const isSavedAgent = agentId != null && agentId !== '' && !isEphemeralAgent(agentId);
  const { tools, agent } = useAgentToolPermissions(isSavedAgent ? agentId : null, ephemeralAgent);
  const modelName = agent?.model ?? conversation?.model ?? '';

  /**
   * 입력창과 같은 규칙: 저장된 agent 면 그 agent 의 MCP 서버에서 이 대화에서 끈 것을 빼고,
   * 아니면 대화 메뉴의 서버와 이 대화에서 고른 값을 쓴다. 목록 응답은 서버 이름이 키라 값에 이름이 없다.
   */
  const serverRows = useMemo(() => {
    const catalog = Object.entries(servers ?? {}).map(([serverName, config]) => ({
      serverName,
      title: config.title,
      chatMenu: config.chatMenu,
      consumeOnly: config.consumeOnly,
    }));
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
    <Section
      title={localize('com_ui_task_context')}
      action={
        files.length > 0 && (
          <div ref={manageRef}>
            <HeadingLink onClick={() => setManageOpen(true)}>
              {localize('com_sidepanel_manage_files')}
            </HeadingLink>
          </div>
        )
      }
      open={open}
      onToggle={onToggle}
    >
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
      {manageOpen && (
        <MyFilesModal open={manageOpen} onOpenChange={setManageOpen} triggerRef={manageRef} />
      )}
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

/** 오른쪽 작업 패널: 진행·결과물·참고 자료와, 거기서 여는 결과 화면. */
export default function TaskPanel({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const [panel, setPanel] = useAtom(taskPanelState);
  const [sections, setSections] = useState({ progress: true, outputs: true, context: true });
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { data: messages } = useGetMessagesByConvoId(conversationId, {
    enabled: false,
    select: selectMessages,
  });
  const { data: servers } = useMCPServersQuery({ enabled: false });
  const serverTitles = useServerTitles(servers);
  const { call, progress, steps, awaiting, status } = useTaskRunState(conversationId);
  const outputs = useMemo(() => collectTaskOutputs(messages), [messages]);
  const activity = useMemo(() => collectToolActivity(messages), [messages]);

  const toggle = (name: keyof typeof sections) => () =>
    setSections((current) => ({ ...current, [name]: !current[name] }));

  const openResultId = panel.view === 'result' ? panel.resultId : null;

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
          <span
            aria-hidden="true"
            className={cn('size-[7px] rounded-full', TASK_STATUS_DOT[status])}
          />
          {localize(TASK_STATUS_LABEL[status])}
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
      {openResultId != null ? (
        <ResultView
          resultId={openResultId}
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
              activity={activity}
              serverTitles={serverTitles}
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
            servers={servers}
            isTaskMode={call != null}
            open={sections.context}
            onToggle={toggle('context')}
          />
        </div>
      )}
    </aside>
  );
}
