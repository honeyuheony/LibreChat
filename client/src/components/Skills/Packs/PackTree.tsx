type TreeRow = { depth: number; label: string };

/** 팩을 Claude 플러그인 배치로 내보낼 때의 파일 경로. 편집기 「만들어지는 폴더」와 같은 이름을 쓴다. */
export function packPaths(skillNames: string[], hasConnectors: boolean): string[] {
  return [
    '.claude-plugin/plugin.json',
    ...skillNames.map((name) => `skills/${name}/SKILL.md`),
    ...(hasConnectors ? ['.mcp.json'] : []),
    'README.md',
  ];
}

function treeRows(paths: string[]): TreeRow[] {
  const seen = new Set<string>();
  const nested = paths.filter((path) => path.includes('/'));
  const flat = paths.filter((path) => !path.includes('/'));
  return [...nested, ...flat].flatMap((path) => {
    const segments = path.split('/');
    const dirs = segments.slice(0, -1).flatMap((segment, index) => {
      const dir = segments.slice(0, index + 1).join('/');
      if (seen.has(dir)) {
        return [];
      }
      seen.add(dir);
      return [{ depth: index + 1, label: `${segment}/` }];
    });
    return [...dirs, { depth: segments.length, label: segments[segments.length - 1] }];
  });
}

export default function PackTree({ root, paths }: { root: string; paths: string[] }) {
  const rows = [{ depth: 0, label: `${root}/` }, ...treeRows(paths)];
  return (
    <ul className="rounded-lg border border-border-light bg-surface-primary py-1.5 font-mono text-xs text-text-secondary">
      {rows.map((row, index) => (
        <li key={`${index}:${row.label}`} style={{ paddingInlineStart: row.depth * 16 + 8 }}>
          {row.label.endsWith('/') && <span aria-hidden="true">{'▾ '}</span>}
          <span>{row.label}</span>
        </li>
      ))}
    </ul>
  );
}
