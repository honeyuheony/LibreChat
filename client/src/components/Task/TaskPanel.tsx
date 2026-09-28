import { useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { X } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { normalizeServerName } from 'librechat-data-provider';
import type { MCPServersListResponse } from 'librechat-data-provider';
import useTaskRunState, { TASK_STATUS_DOT, TASK_STATUS_LABEL } from './useTaskRunState';
import { collectTaskOutputs, collectToolActivity } from './taskState';
import { useTaskResultQuery } from '~/data-provider/Tasks/queries';
import { useMCPServersQuery } from '~/data-provider';
import useCachedMessages from './useCachedMessages';
import ProgressSection from './ProgressSection';
import ContextSection from './ContextSection';
import OutputsSection from './OutputsSection';
import { taskPanelState } from '~/store/task';
import TaskDocView from './TaskDocView';
import { useLocalize } from '~/hooks';
import TaskTable from './TaskTable';
import { cn } from '~/utils';
import store from '~/store';

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
  const messages = useCachedMessages(conversationId);
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
      className="flex h-full flex-col overflow-hidden border-l border-border-light bg-surface-secondary"
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
