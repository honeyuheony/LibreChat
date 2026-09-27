import type { TTaskResultListItem } from 'librechat-data-provider';

/**
 * A table result's saved title joins its column names after the first ` · `,
 * so lists show only the leading part and the row count.
 */
export function shortResultTitle(
  { kind, title, rows }: Pick<TTaskResultListItem, 'kind' | 'title' | 'rows'>,
  formatCount: (rowCount: number) => string,
): string {
  if (kind !== 'table') {
    return title;
  }
  const [head] = title.split(' · ', 1);
  if (rows === undefined) {
    return head;
  }
  return `${head} · ${formatCount(rows)}`;
}
