import { useRef } from 'react';
import { Button } from '@librechat/client';
import type { TranslationKeys } from '~/hooks';
import type { BuilderFile } from './state';
import { EMOJI_STYLE } from './Blocks';
import { useLocalize } from '~/hooks';

/** 붙인 문서 이름과 종류. 종류 키를 이어 붙여 만들므로 키의 형을 맞춘다. */
function FileChips({ files }: { files: BuilderFile[] }) {
  const localize = useLocalize();
  if (files.length === 0) {
    return null;
  }
  return (
    <ul aria-label={localize('com_skills_builder_files_list')} className="contents">
      {files.map((file) => (
        <li
          key={file.name}
          className="inline-flex items-center gap-1 rounded-full border border-border-light bg-surface-secondary px-2 py-0.5 text-xs text-text-primary"
        >
          {file.name}
          <span className="font-bold text-text-secondary">
            {localize(`com_skills_builder_file_kind_${file.kind}` as TranslationKeys)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 양식·예시 문서 붙이기 줄. 고른 문서는 저장할 때 스킬 폴더에 올라가 시험과 실행에서 읽힌다. */
export default function AttachRow({
  files,
  onPick,
  onClear,
}: {
  files: BuilderFile[];
  onPick: (picked: File[]) => void;
  onClear: () => void;
}) {
  const localize = useLocalize();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border-[1.5px] border-solid border-border-medium bg-surface-primary px-2.5 py-2">
      <Button
        variant="outline"
        size="sm"
        className="h-auto gap-1 rounded-full border-border-medium px-[11px] py-[3px] text-[13px]"
        onClick={() => input.current?.click()}
      >
        <span aria-hidden="true" style={EMOJI_STYLE}>
          📎
        </span>
        {localize('com_skills_builder_files_attach')}
      </Button>
      {files.length > 0 ? (
        <>
          <FileChips files={files} />
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-border-medium px-2.5 py-0.5 text-xs text-text-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          >
            {localize('com_ui_clear_all')}
          </button>
        </>
      ) : (
        <span className="text-xs text-text-secondary">
          {localize('com_skills_builder_files_hint')}
        </span>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        data-testid="builder-files"
        onChange={(event) => {
          onPick(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
    </div>
  );
}
