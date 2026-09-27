import { useCallback, useMemo, useState } from 'react';
import remarkGfm from 'remark-gfm';
import copy from 'copy-to-clipboard';
import ReactMarkdown from 'react-markdown';
import { useToastContext } from '@librechat/client';
import type { TaskDocResult } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { downloadTaskReportFile } from '~/data-provider/Tasks/queries';
import { countTaskFootnotes, formatTaskTime } from './taskState';
import { remarkCjkEmphasis } from '~/utils/cjkEmphasis';
import { useAuthContext, useLocalize } from '~/hooks';
import TaskFootnote from './TaskFootnote';

const FOOTNOTE_HREF = '#task-fn-';
const FOOTNOTE_MARKER = /\[\^(\d+)\]/g;

/** `[^n]` 을 링크로 바꿔 두면 react-markdown 이 아래 `a` 대체 컴포넌트에 넘기고, 거기서 각주를 그린다. */
const linkFootnotes = (body: string) => body.replace(FOOTNOTE_MARKER, `[$1](${FOOTNOTE_HREF}$1)`);

/** 클립보드에 넣을 마크다운: 본문 뒤에 각주마다 `[^n]: 파일 — "인용"` 한 줄을 붙인다. */
export function taskDocToMarkdown(result: TaskDocResult): string {
  if (result.footnotes.length === 0) {
    return result.body;
  }
  const notes = result.footnotes.map(({ n, filename, evidence }) => {
    let location = '';
    if (evidence.page != null) {
      location = ` (p.${evidence.page})`;
    } else if (evidence.paragraph != null) {
      location = ` (¶${evidence.paragraph})`;
    }
    return `[^${n}]: ${filename}${location} — "${evidence.quote}"`;
  });
  return `${result.body}\n\n${notes.join('\n')}`;
}

export default function TaskDocView({ result }: { result: TaskDocResult }) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const [downloading, setDownloading] = useState(false);

  const footnotes = useMemo(
    () => new Map(result.footnotes.map((footnote) => [footnote.n, footnote])),
    [result.footnotes],
  );

  const components = useMemo(
    () => ({
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        if (href?.startsWith(FOOTNOTE_HREF)) {
          const n = Number(href.slice(FOOTNOTE_HREF.length));
          const footnote = footnotes.get(n);
          return <TaskFootnote n={n} filename={footnote?.filename} evidence={footnote?.evidence} />;
        }
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        );
      },
    }),
    [footnotes],
  );

  const onCopy = useCallback(() => {
    copy(taskDocToMarkdown(result), { format: 'text/plain' });
    showToast({ message: localize('com_ui_copied_to_clipboard'), status: 'success' });
  }, [localize, result, showToast]);

  const reportFile = result.kind === 'report' ? result.file : undefined;
  const onDownloadHwp = useCallback(async () => {
    if (!reportFile || !user?.id) {
      return;
    }
    setDownloading(true);
    try {
      await downloadTaskReportFile(user.id, reportFile);
    } catch {
      showToast({ message: localize('com_ui_task_download_error'), status: 'error' });
    } finally {
      setDownloading(false);
    }
  }, [localize, reportFile, showToast, user?.id]);

  const buttonClass =
    'rounded-md border border-border-medium px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-end gap-2">
        <button type="button" onClick={onCopy} className={buttonClass}>
          {localize('com_ui_copy')}
        </button>
        {reportFile && (
          <button
            type="button"
            onClick={onDownloadHwp}
            disabled={downloading}
            className={buttonClass}
          >
            HWP
          </button>
        )}
      </div>
      <div className="markdown prose dark:prose-invert min-h-0 flex-1 overflow-auto text-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkCjkEmphasis]} components={components}>
          {linkFootnotes(result.body)}
        </ReactMarkdown>
      </div>
      <div className="mt-2 flex flex-wrap gap-2.5 text-xs text-text-muted">
        <span>{localize('com_ui_task_evidence_count', { count: countTaskFootnotes(result) })}</span>
        <span className="ml-auto">{formatTaskTime(result.createdAt)}</span>
      </div>
    </div>
  );
}
