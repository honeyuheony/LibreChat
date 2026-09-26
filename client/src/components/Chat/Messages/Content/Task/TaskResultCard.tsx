import { useContext, useEffect, useMemo, useRef } from 'react';
import { useSetAtom } from 'jotai';
import copy from 'copy-to-clipboard';
import { useSetRecoilState } from 'recoil';
import { Button, useToastContext } from '@librechat/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskDocResult, TaskEvidence, TaskTableResult } from 'librechat-data-provider';
import type { TaskResultAttachment } from './api';
import { useAuthContext, useLocalize, useSubmitMessage } from '~/hooks';
import { fetchTaskExcel, fetchTaskResult } from './api';
import { ChatContext } from '~/Providers/ChatContext';
import { useFileDownload } from '~/data-provider';
import { taskPanelState } from '~/store/task';
import { cn, triggerDownload } from '~/utils';
import store from '~/store';

type Localize = ReturnType<typeof useLocalize>;

const taskResultKey = (resultId: string) => ['taskResult', resultId];

/** Top three values per field, counted from the rows ("값 3건, 없음 2건"). */
export function topValueCounts(result: TaskTableResult, localize: Localize): string[] {
  return result.fields.map((field, column) => {
    const counts = new Map<string, number>();
    for (const row of result.rows) {
      const value = row.cells[column]?.value ?? null;
      const key = value == null ? localize('com_ui_task_value_none') : value;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return `${field}: ${top
      .map(([value, count]) => `${value} ${localize('com_ui_task_count', { 0: count })}`)
      .join(', ')}`;
  });
}

function evidenceLocation(evidence: TaskEvidence, localize: Localize): string {
  if (evidence.page != null) {
    return localize('com_ui_task_page', { 0: evidence.page });
  }
  if (evidence.paragraph != null) {
    return localize('com_ui_task_paragraph', { 0: evidence.paragraph });
  }
  return '';
}

/** Markdown body plus `[^n]:` footnote definitions, for the 「복사」 button. */
export function docResultMarkdown(result: TaskDocResult, localize: Localize): string {
  const notes = result.footnotes.map((note) => {
    const location = evidenceLocation(note.evidence, localize);
    const where = [note.filename, location].filter(Boolean).join(' › ');
    return `[^${note.n}]: ${where} — "${note.evidence.quote}"`;
  });
  return notes.length > 0 ? `${result.body}\n\n${notes.join('\n')}` : result.body;
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="h-8 px-2.5 text-text-secondary" onClick={onClick}>
      {label}
    </Button>
  );
}

function ReportFromTableButton() {
  const localize = useLocalize();
  const { submitMessage } = useSubmitMessage();
  return (
    <ActionButton
      label={localize('com_ui_task_to_report')}
      onClick={() => submitMessage({ text: localize('com_ui_task_to_report_prompt') })}
    />
  );
}

function HwpDownloadButton({ file }: { file: { file_id: string; filename: string } }) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const { refetch } = useFileDownload(user?.id ?? '', file.file_id, { direct: false });
  const download = async () => {
    const response = await refetch();
    if (response.data == null || response.data === '') {
      showToast({ status: 'error', message: localize('com_ui_download_error') });
      return;
    }
    triggerDownload(response.data, file.filename);
  };
  return <ActionButton label={localize('com_ui_task_hwp_download')} onClick={download} />;
}

/**
 * Result message for a finished task tool: coverage line, code-counted notes and the
 * open/export buttons. Opens the task panel on its own when the result arrives live.
 */
export default function TaskResultCard({
  result,
  autoOpen = false,
}: {
  result: TaskResultAttachment;
  autoOpen?: boolean;
}) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const inChat = useContext(ChatContext) != null;
  const setTaskPanel = useSetAtom(taskPanelState);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);
  const { resultId, kind, stats } = result;

  const tableQuery = useQuery(taskResultKey(resultId), () => fetchTaskResult(resultId), {
    enabled: kind === 'table',
    retry: false,
    refetchOnWindowFocus: false,
  });
  const valueCounts = useMemo(
    () => (tableQuery.data?.kind === 'table' ? topValueCounts(tableQuery.data, localize) : []),
    [tableQuery.data, localize],
  );

  const openResult = () => {
    setArtifactsVisible(false);
    setTaskPanel({ open: true, view: 'result', resultId });
  };

  const openedRef = useRef(false);
  useEffect(() => {
    if (autoOpen && !openedRef.current) {
      openedRef.current = true;
      openResult();
    }
    // Opens once per mounted live result; later renders must not reopen a closed panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  const copyResult = async () => {
    try {
      const doc = await queryClient.fetchQuery(taskResultKey(resultId), () =>
        fetchTaskResult(resultId),
      );
      if (
        doc.kind === 'table' ||
        !copy(docResultMarkdown(doc, localize), { format: 'text/plain' })
      ) {
        throw new Error('copy failed');
      }
      showToast({ status: 'success', message: localize('com_ui_task_copied') });
    } catch {
      showToast({ status: 'error', message: localize('com_ui_task_copy_error') });
    }
  };

  const downloadExcel = async () => {
    try {
      const blob = await fetchTaskExcel(resultId);
      triggerDownload(URL.createObjectURL(blob), `${result.title}.xlsx`);
    } catch {
      showToast({ status: 'error', message: localize('com_ui_task_excel_error') });
    }
  };

  const complete = stats.reflected === stats.docs;
  const allCached = stats.docs > 0 && stats.cached === stats.docs;
  const scope = [
    localize('com_ui_task_scope', { 0: stats.docs, 1: stats.reflected, 2: stats.seconds }),
    allCached ? localize('com_ui_task_scope_cached') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const textOnly =
    stats.textOnly > 0 ? ` ${localize('com_ui_task_result_text_only', { 0: stats.textOnly })}` : '';

  let message = '';
  let note = '';
  if (kind === 'table') {
    message = localize('com_ui_task_result_table');
    note = localize('com_ui_task_result_table_note', { 0: stats.none, 1: stats.low }) + textOnly;
  } else if (kind === 'summary') {
    message = localize('com_ui_task_result_summary');
  } else if (result.file != null) {
    message = localize('com_ui_task_result_report');
    note = localize('com_ui_task_result_report_note', { 0: stats.none }) + textOnly;
  } else {
    message = localize('com_ui_task_result_report_no_file');
    note = localize('com_ui_task_result_report_note', { 0: stats.none }) + textOnly;
  }

  return (
    <div className="mt-3 flex flex-col" data-testid="task-result-card" data-kind={kind}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[0.8125rem] text-text-secondary">
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            complete ? 'bg-status-success-strong' : 'bg-status-warning-strong',
          )}
        />
        <span data-testid="task-result-scope">{scope}</span>
      </div>
      <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-text-primary">
        {message}
      </p>
      {valueCounts.length > 0 && (
        <ul className="mt-1 list-none text-[0.9375rem] leading-relaxed text-text-primary">
          {valueCounts.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {note && <p className="mt-1 text-[0.8125rem] text-text-secondary">{note}</p>}
      <div className="mt-1.5 flex flex-wrap gap-0.5">
        {kind === 'table' && (
          <>
            <ActionButton label={localize('com_ui_task_open_table')} onClick={openResult} />
            <ActionButton label={localize('com_ui_task_excel')} onClick={downloadExcel} />
            {inChat && <ReportFromTableButton />}
          </>
        )}
        {kind === 'summary' && (
          <>
            <ActionButton label={localize('com_ui_task_open_summary')} onClick={openResult} />
            <ActionButton label={localize('com_ui_task_copy')} onClick={copyResult} />
          </>
        )}
        {kind === 'report' && (
          <>
            <ActionButton label={localize('com_ui_task_open')} onClick={openResult} />
            {result.file != null && <HwpDownloadButton file={result.file} />}
          </>
        )}
      </div>
    </div>
  );
}
