import React, { useMemo, useState } from 'react';
import { Spinner } from '@librechat/client';
import {
  useGetSkillFileContentQuery,
  useGetSkillQuery,
  useListSkillFilesQuery,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const SKILL_MD = 'SKILL.md';

type TreeRow = { kind: 'dir' | 'file'; path: string; label: string; depth: number };

/** 폴더를 먼저, 같은 깊이에서는 이름순으로 펼친다. */
function buildTreeRows(paths: string[]): TreeRow[] {
  const sorted = paths
    .slice()
    .sort((a, b) => (a.includes('/') ? 0 : 1) - (b.includes('/') ? 0 : 1) || a.localeCompare(b));
  const rows: TreeRow[] = [];
  const seenDirs = new Set<string>();
  for (const filePath of sorted) {
    const segments = filePath.split('/');
    for (let i = 1; i < segments.length; i++) {
      const dir = segments.slice(0, i).join('/');
      if (!seenDirs.has(dir)) {
        seenDirs.add(dir);
        rows.push({ kind: 'dir', path: dir, label: `${segments[i - 1]}/`, depth: i });
      }
    }
    rows.push({
      kind: 'file',
      path: filePath,
      label: segments[segments.length - 1],
      depth: segments.length,
    });
  }
  return rows;
}

/** 스킬 폴더(SKILL.md 와 딸린 파일)를 트리로 보이고, 고른 파일의 내용을 옆에 보인다. */
export default function SkillFolderTree({
  skillId,
  rootName,
}: {
  skillId: string;
  rootName: string;
}) {
  const localize = useLocalize();
  const [selected, setSelected] = useState(SKILL_MD);
  const skillQuery = useGetSkillQuery(skillId);
  const filesQuery = useListSkillFilesQuery(skillId);
  const isSkillMd = selected === SKILL_MD;
  const fileQuery = useGetSkillFileContentQuery(skillId, isSkillMd ? null : selected);

  const rows = useMemo(
    () =>
      buildTreeRows([SKILL_MD, ...(filesQuery.data?.files ?? []).map((file) => file.relativePath)]),
    [filesQuery.data?.files],
  );

  let content: React.ReactNode;
  if (isSkillMd ? skillQuery.isLoading : fileQuery.isLoading) {
    content = <Spinner className="size-4 text-text-primary" />;
  } else if (isSkillMd) {
    content = skillQuery.data?.body ?? localize('com_skills_file_unavailable');
  } else if (fileQuery.data?.isBinary) {
    content = localize('com_skills_file_binary');
  } else {
    content = fileQuery.data?.content ?? localize('com_skills_file_unavailable');
  }

  return (
    <div className="mt-2 grid grid-cols-1 gap-2.5 text-left md:grid-cols-[minmax(150px,220px)_minmax(0,1fr)]">
      <div className="max-h-[46vh] overflow-auto rounded-xl border border-border-light bg-surface-primary py-1.5 font-mono text-xs">
        <div className="whitespace-nowrap px-2 py-[3px] font-semibold text-text-primary">
          {`▾ ${rootName}/`}
        </div>
        {rows.map((row) =>
          row.kind === 'dir' ? (
            <div
              key={`dir:${row.path}`}
              className="whitespace-nowrap py-[3px] pr-2 font-semibold text-text-primary"
              style={{ paddingLeft: row.depth * 16 + 8 }}
            >
              {`▾ ${row.label}`}
            </div>
          ) : (
            <button
              key={`file:${row.path}`}
              type="button"
              onClick={() => setSelected(row.path)}
              className={cn(
                'block w-full whitespace-nowrap py-[3px] pr-2 text-left text-text-tertiary hover:bg-surface-hover',
                row.path === selected && 'bg-[#ede9fe] text-[#5b21b6]',
              )}
              style={{ paddingLeft: row.depth * 16 + 8 }}
            >
              {row.label}
            </button>
          ),
        )}
      </div>
      <div className="min-w-0">
        <div className="mb-1 font-mono text-[11.5px] text-text-muted">{selected}</div>
        <pre className="m-0 max-h-[42vh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-tertiary p-3 font-mono text-xs text-text-primary">
          {content}
        </pre>
      </div>
    </div>
  );
}
