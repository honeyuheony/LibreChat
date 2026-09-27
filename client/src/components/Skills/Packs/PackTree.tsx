import type { FolderRow } from '../utils/tree';
import { folderIndent, folderRows } from '../utils/tree';

/** 팩을 Claude 플러그인 배치로 내보낼 때의 파일 경로. 편집기 「만들어지는 폴더」와 같은 이름을 쓴다. */
export function packPaths(skillNames: string[], hasConnectors: boolean): string[] {
  return [
    '.claude-plugin/plugin.json',
    ...skillNames.map((name) => `skills/${name}/SKILL.md`),
    ...(hasConnectors ? ['.mcp.json'] : []),
    'README.md',
  ];
}

/** 팩에 담은 순서대로 늘어놓고 이름순으로 다시 정렬하지 않는다. */
export default function PackTree({ root, paths }: { root: string; paths: string[] }) {
  const rows: FolderRow[] = [
    { kind: 'dir', path: '', name: root, depth: 0 },
    ...folderRows(paths, false),
  ];
  return (
    <ul className="rounded-lg border border-border-light bg-surface-primary py-1.5 font-mono text-xs text-text-secondary">
      {rows.map((row, index) => (
        <li key={`${index}:${row.name}`} style={{ paddingInlineStart: folderIndent(row.depth) }}>
          {row.kind === 'dir' && <span aria-hidden="true">{'▾ '}</span>}
          <span>{row.kind === 'dir' ? `${row.name}/` : row.name}</span>
        </li>
      ))}
    </ul>
  );
}
