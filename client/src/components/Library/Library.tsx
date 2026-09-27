import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Table,
  Button,
  Spinner,
  TableRow,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  useMediaQuery,
} from '@librechat/client';
import type { TTaskResultListItem } from 'librechat-data-provider';
import type { MouseEvent } from 'react';
import type { TranslationKeys } from '~/hooks';
import { useTaskResultsInfiniteQuery } from '~/data-provider/Tasks';
import { RESULT_QUERY_PARAM } from '~/components/Task/useTaskPanel';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { shortResultTitle } from '~/utils/results';
import { useLocalize } from '~/hooks';

/** New keys that DA adds to the translation files; drop the cast in `useLibraryLocalize` then. */
type LibraryKey =
  | 'com_ui_library'
  | 'com_ui_library_intro'
  | 'com_ui_library_empty'
  | 'com_ui_library_error'
  | 'com_ui_library_col_type'
  | 'com_ui_library_col_created'
  | 'com_ui_library_col_action'
  | 'com_ui_library_kind_table'
  | 'com_ui_library_kind_hwp'
  | 'com_ui_library_kind_doc'
  | 'com_ui_library_date_older';

const DAY_MS = 24 * 60 * 60 * 1000;
const HWP_FILE = /\.hwpx?$/i;

const resultPath = (item: TTaskResultListItem) =>
  `/c/${encodeURIComponent(item.conversationId)}?${RESULT_QUERY_PARAM}=${encodeURIComponent(item.resultId)}`;

/** The wireframe's four day buckets, counted in local calendar days. */
function dayLabelKey(createdAt: Date, now: Date): TranslationKeys | LibraryKey {
  const startOf = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.floor((startOf(now) - startOf(createdAt)) / DAY_MS);
  if (days <= 0) {
    return 'com_ui_date_today';
  }
  if (days === 1) {
    return 'com_ui_date_yesterday';
  }
  return days < 7 ? 'com_ui_date_previous_7_days' : 'com_ui_library_date_older';
}

const clockTime = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

function useLibraryLocalize() {
  const localize = useLocalize();
  return (key: TranslationKeys | LibraryKey, options?: Record<string, string>) =>
    localize(key as TranslationKeys, options);
}

export default function Library() {
  const localize = useLibraryLocalize();
  const navigate = useNavigate();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useTaskResultsInfiniteQuery();

  const items = useMemo(() => data?.pages.flatMap((page) => page.results) ?? [], [data]);
  const now = new Date();

  const typeLabel = (item: TTaskResultListItem) => {
    if (item.kind === 'table') {
      return localize('com_ui_library_kind_table', { 0: String(item.rows ?? 0) });
    }
    return HWP_FILE.test(item.fileName ?? item.title)
      ? localize('com_ui_library_kind_hwp')
      : localize('com_ui_library_kind_doc');
  };

  const openRow = (event: MouseEvent<HTMLTableRowElement>, item: TTaskResultListItem) => {
    /** The title link navigates on its own; the row covers clicks on the other cells. */
    if ((event.target as Element).closest('a')) {
      return;
    }
    navigate(resultPath(item));
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <div role="status" className="flex items-center gap-2 py-6 text-sm text-text-secondary">
          <Spinner className="size-4" />
          {localize('com_ui_loading')}
        </div>
      );
    }
    if (isError) {
      return (
        <div role="alert" className="flex items-center gap-3 py-6 text-sm text-text-secondary">
          {localize('com_ui_library_error')}
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            {localize('com_ui_retry')}
          </Button>
        </div>
      );
    }
    return (
      <>
        <Table className="table-fixed text-[13px]">
          <TableHeader className="bg-surface-primary">
            <TableRow className="h-7">
              <TableHead className="h-7 w-[38%] px-2 py-1 text-[11.5px] text-text-muted">
                {localize('com_ui_name')}
              </TableHead>
              <TableHead className="h-7 w-[13%] whitespace-nowrap px-2 py-1 text-[11.5px] text-text-muted">
                {localize('com_ui_library_col_type')}
              </TableHead>
              <TableHead className="h-7 w-[27%] px-2 py-1 text-[11.5px] text-text-muted">
                {localize('com_ui_conversation')}
              </TableHead>
              <TableHead className="h-7 w-[14%] whitespace-nowrap px-2 py-1 text-[11.5px] text-text-muted">
                {localize('com_ui_library_col_created')}
              </TableHead>
              <TableHead className="h-7 w-[8%] whitespace-nowrap px-2 py-1 text-[11.5px] text-text-muted">
                <span className="sr-only">{localize('com_ui_library_col_action')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="px-2 py-2 text-text-secondary">
                  {localize('com_ui_library_empty')}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const createdAt = new Date(item.createdAt);
                return (
                  <TableRow
                    key={item.resultId}
                    className="h-9 cursor-pointer"
                    onClick={(event) => openRow(event, item)}
                  >
                    <TableCell className="px-2 py-2 text-text-primary">
                      <span aria-hidden="true" className="mr-1.5 text-text-secondary">
                        {item.kind === 'table' ? '▦' : '≡'}
                      </span>
                      <Link to={resultPath(item)} className="hover:underline">
                        {shortResultTitle(item)}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-2 text-text-secondary">
                      {typeLabel(item)}
                    </TableCell>
                    <TableCell className="px-2 py-2 text-text-secondary">
                      {item.conversationTitle}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-2 text-text-secondary">
                      {`${localize(dayLabelKey(createdAt, now))} ${clockTime(createdAt)}`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-2 py-2 text-text-tertiary">
                      {item.kind === 'table'
                        ? localize('com_ui_task_excel')
                        : localize('com_ui_task_copy')}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {hasNextPage && (
          <div className="mt-4 flex justify-center">
            <Button
              size="sm"
              variant="outline"
              disabled={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            >
              {localize('com_ui_show_more')}
            </Button>
          </div>
        )}
      </>
    );
  };

  return (
    <main
      className="relative flex h-full w-full grow flex-col overflow-y-auto bg-presentation"
      data-testid="library"
    >
      <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border-light bg-presentation/70 px-4 text-[14.5px] text-text-secondary backdrop-blur-md">
        {isSmallScreen && <OpenSidebar />}
        <span className="font-semibold text-text-primary">{localize('com_ui_library')}</span>
      </header>
      <div className="mx-auto w-full max-w-[900px] px-6 pb-10 pt-6">
        <h1 className="text-2xl font-bold text-text-primary">{localize('com_ui_library')}</h1>
        {!isLoading && !isError && (
          <p className="mb-3 mt-1 text-[13px] text-text-muted">
            {localize('com_ui_library_intro', {
              0: `${items.length}${hasNextPage ? '+' : ''}`,
            })}
          </p>
        )}
        {renderBody()}
      </div>
    </main>
  );
}
