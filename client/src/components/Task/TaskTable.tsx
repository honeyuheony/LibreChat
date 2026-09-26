import { useCallback, useState } from 'react';
import { useToastContext } from '@librechat/client';
import type { TaskTableResult } from 'librechat-data-provider';
import type { UIEvent } from 'react';
import { downloadTaskResultWorkbook } from '~/data-provider/Tasks/queries';
import { formatTaskTime } from './taskState';
import TaskFootnote from './TaskFootnote';
import { useLocalize } from '~/hooks';

/** Rows drawn per step; more are added as the reader scrolls near the bottom. */
export const TASK_TABLE_PAGE = 40;

const stripExtension = (filename: string) => filename.replace(/\.[^.]+$/, '');

export default function TaskTable({ result }: { result: TaskTableResult }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [visibleRows, setVisibleRows] = useState(TASK_TABLE_PAGE);
  const [exporting, setExporting] = useState(false);
  const shownRows = result.rows.slice(0, visibleRows);
  const hiddenRows = result.rows.length - shownRows.length;

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget;
      if (hiddenRows > 0 && target.scrollTop + target.clientHeight >= target.scrollHeight - 48) {
        setVisibleRows((count) => count + TASK_TABLE_PAGE);
      }
    },
    [hiddenRows],
  );

  const onExport = useCallback(async () => {
    setExporting(true);
    try {
      await downloadTaskResultWorkbook(result.resultId, `${result.title}.xlsx`);
    } catch {
      showToast({ message: localize('com_ui_task_excel_error'), status: 'error' });
    } finally {
      setExporting(false);
    }
  }, [localize, result.resultId, result.title, showToast]);

  /** Footnote numbers run across the table in reading order, one per filled cell. */
  let footnote = 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="rounded-md border border-border-medium px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
        >
          {localize('com_ui_task_excel')}
        </button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto"
        onScroll={onScroll}
        data-testid="task-table-scroll"
      >
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-surface-primary">
            <tr>
              <th className="border-b border-border-light px-2 py-1.5 text-left font-semibold text-text-secondary">
                {localize('com_ui_task_col_document')}
              </th>
              {result.fields.map((field) => (
                <th
                  key={field}
                  className="border-b border-border-light px-2 py-1.5 text-left font-semibold text-text-secondary"
                >
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownRows.map((row) => (
              <tr key={row.file_id} className="align-top">
                <td className="border-b border-border-light px-2 py-1.5 text-text-primary">
                  {stripExtension(row.filename)}
                </td>
                {row.cells.map((cell, index) => {
                  if (cell.value == null) {
                    return (
                      <td
                        key={index}
                        className="border-b border-border-light px-2 py-1.5 text-text-muted"
                      >
                        {localize('com_ui_task_value_none')}
                      </td>
                    );
                  }
                  footnote += 1;
                  return (
                    <td
                      key={index}
                      className="border-b border-border-light px-2 py-1.5 text-text-primary"
                    >
                      {cell.value}
                      <TaskFootnote n={footnote} filename={row.filename} evidence={cell.evidence} />
                      {cell.status === 'low' && (
                        <span className="ml-1 rounded bg-status-warning-subtle px-1 text-[11px] text-status-warning-strong">
                          {localize('com_ui_task_needs_review')}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {hiddenRows > 0 && (
              <tr>
                <td
                  colSpan={result.fields.length + 1}
                  className="px-2 py-1.5 text-center text-text-muted"
                >
                  {localize('com_ui_task_more_rows', { count: hiddenRows })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-2.5 text-xs text-text-muted">
        <span>{localize('com_ui_task_none_count', { count: result.stats.none })}</span>
        <span>{localize('com_ui_task_low_count', { count: result.stats.low })}</span>
        <span className="ml-auto">
          {localize('com_ui_task_extract_version', {
            /** The server tags it `extract-v1`; the label already says extraction, so only `v1` is shown. */
            version: result.extractor.promptVersion.replace(/^extract-/, ''),
          })}{' '}
          · {formatTaskTime(result.createdAt)}
        </span>
      </div>
    </div>
  );
}
