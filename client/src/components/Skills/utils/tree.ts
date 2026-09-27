export type FolderRow = { kind: 'dir' | 'file'; path: string; name: string; depth: number };

const nestedFirst = (path: string) => (path.includes('/') ? 0 : 1);

/**
 * 파일 경로 목록을 펼친 폴더 나무의 행으로 바꾼다. 하위 폴더가 있는 파일을 먼저 두고,
 * `byName` 이면 그 안에서 이름순으로, 아니면 받은 순서대로 늘어놓는다.
 */
export function folderRows(paths: readonly string[], byName = true): FolderRow[] {
  const sorted = [...paths].sort(
    (a, b) => nestedFirst(a) - nestedFirst(b) || (byName ? a.localeCompare(b) : 0),
  );
  const rows: FolderRow[] = [];
  const seenDirs = new Set<string>();
  for (const path of sorted) {
    const segments = path.split('/');
    for (let i = 1; i < segments.length; i++) {
      const dir = segments.slice(0, i).join('/');
      if (!seenDirs.has(dir)) {
        seenDirs.add(dir);
        rows.push({ kind: 'dir', path: dir, name: segments[i - 1], depth: i });
      }
    }
    rows.push({ kind: 'file', path, name: segments[segments.length - 1], depth: segments.length });
  }
  return rows;
}

/** 나무 행의 들여쓰기(px). */
export const folderIndent = (depth: number) => depth * 16 + 8;
