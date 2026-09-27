import { Radio } from '@librechat/client';
import type { ReactNode } from 'react';
import type { PluginFile } from './state';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type Row = { kind: 'dir' | 'file'; name: string; depth: number; path: string };

const isSkillFile = (path: string) => /SKILL\.md$/.test(path);

/** 하위 폴더가 있는 파일을 먼저, 그다음 맨 위 파일을 이름순으로 늘어놓는다(와이어프레임 `treeRows`). */
export function treeRows(files: PluginFile[]): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  const paths = files
    .map((file) => file.path)
    .sort((a, b) => (a.includes('/') ? 0 : 1) - (b.includes('/') ? 0 : 1) || a.localeCompare(b));
  for (const path of paths) {
    const segments = path.split('/');
    for (let i = 1; i < segments.length; i++) {
      const dir = segments.slice(0, i).join('/');
      if (!seen.has(dir)) {
        seen.add(dir);
        rows.push({ kind: 'dir', name: segments[i - 1], depth: i, path: dir });
      }
    }
    rows.push({ kind: 'file', name: segments[segments.length - 1], depth: segments.length, path });
  }
  return rows;
}

type FolderProps = {
  root: string;
  files: PluginFile[];
  selected: string;
  onSelect: (path: string) => void;
  raw: boolean;
  onRaw: (raw: boolean) => void;
  empty: boolean;
  readable: ReactNode;
};

/** 「만들어지는 폴더」 나무와 고른 파일 보기. SKILL.md 는 읽기 쉽게·원문을 오간다. */
export default function Folder({
  root,
  files,
  selected,
  onSelect,
  raw,
  onRaw,
  empty,
  readable,
}: FolderProps) {
  const localize = useLocalize();
  const current = files.find((file) => file.path === selected) ?? files[0];
  const showReadable = isSkillFile(current.path) && !raw;

  return (
    <>
      <div className="mb-1.5 mt-3 flex items-baseline gap-2">
        <b className="text-sm text-text-primary">{localize('com_skills_builder_folder')}</b>
        <span className="text-xs text-text-secondary">
          {localize(empty ? 'com_skills_builder_folder_empty' : 'com_skills_builder_folder_ready')}
        </span>
      </div>
      <div
        role="tree"
        aria-label={localize('com_skills_builder_folder')}
        className="rounded-lg border border-border-light bg-surface-primary py-1 font-mono text-xs"
      >
        <div
          role="treeitem"
          aria-expanded
          aria-selected={false}
          className="px-2 py-0.5 font-semibold text-text-primary"
        >
          {`▾ ${root}/`}
        </div>
        {treeRows(files).map((row) =>
          row.kind === 'dir' ? (
            <div
              key={`dir:${row.path}`}
              role="treeitem"
              aria-expanded
              aria-selected={false}
              className="py-0.5 font-semibold text-text-primary"
              style={{ paddingInlineStart: row.depth * 16 + 8 }}
            >
              {`▾ ${row.name}/`}
            </div>
          ) : (
            <button
              key={`file:${row.path}`}
              type="button"
              role="treeitem"
              aria-selected={row.path === current.path}
              onClick={() => onSelect(row.path)}
              className={cn(
                'block w-full py-0.5 text-start text-text-secondary hover:bg-surface-hover',
                row.path === current.path && 'bg-surface-brand-subtle text-text-primary',
              )}
              style={{ paddingInlineStart: row.depth * 16 + 8 }}
            >
              {row.name}
              {isSkillFile(row.path) && (
                <span className="ms-1.5 font-sans text-[11px] text-text-secondary">
                  {localize('com_skills_builder_folder_main')}
                </span>
              )}
            </button>
          ),
        )}
      </div>
      <div className="mt-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex-1 truncate font-mono text-xs text-text-secondary">
            {current.path}
          </span>
          {isSkillFile(current.path) && (
            <Radio
              value={raw ? 'raw' : 'readable'}
              onChange={(value) => onRaw(value === 'raw')}
              options={[
                { value: 'readable', label: localize('com_skills_builder_view_readable') },
                { value: 'raw', label: localize('com_skills_builder_view_raw') },
              ]}
            />
          )}
        </div>
        {showReadable ? (
          readable
        ) : (
          <pre
            data-testid="builder-raw"
            className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-border-light bg-surface-primary p-3 font-mono text-xs text-text-primary"
          >
            {current.content}
          </pre>
        )}
      </div>
    </>
  );
}
