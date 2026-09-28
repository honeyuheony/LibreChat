import { Spinner } from '@librechat/client';
import { FileText, CornerUpLeft } from 'lucide-react';
import type { SubtitleAction } from './FileContainer';
import type { ExtendedFile } from '~/common';
import {
  composerChipClassName,
  composerChipIconClassName,
  composerChipCloseClassName,
} from '../chip';
import ImagePreview from './ImagePreview';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const CLOSE_GLYPH = '×';

const focusRing =
  'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary';

/** 입력창에 붙인 파일 하나를 켜진 도구와 같은 알약으로 그린다. 앞머리 아이콘 칸이 업로드 중 표시와 이미지 미리보기를 맡는다. */
export default function FileChip({
  file,
  previewUrl,
  onDelete,
  onClick,
  ariaLabel,
  secondaryAction,
}: {
  file: ExtendedFile;
  previewUrl?: string;
  onDelete: () => void;
  onClick?: () => void;
  ariaLabel?: string;
  secondaryAction?: SubtitleAction;
}) {
  const localize = useLocalize();
  const name = file.filename ?? '';
  const uploading = file.progress < 1;
  const showsPreview =
    !uploading && previewUrl != null && (file.type?.startsWith('image') ?? false);

  let lead = <FileText aria-hidden="true" />;
  if (uploading) {
    lead = <Spinner size={12} className="m-0" />;
  } else if (showsPreview) {
    lead = (
      <ImagePreview
        url={previewUrl}
        source={file.source}
        className="size-3 rounded-[3px] focus-visible:ring-offset-0"
      />
    );
  }

  return (
    <div
      data-testid="composer-file-chip"
      aria-busy={uploading || undefined}
      title={name}
      className={composerChipClassName}
    >
      <span aria-hidden={showsPreview ? undefined : 'true'} className={composerChipIconClassName}>
        {lead}
      </span>
      {onClick != null ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel ?? name}
          className={cn('truncate hover:underline', focusRing)}
        >
          {name}
        </button>
      ) : (
        <span className="truncate">{name}</span>
      )}
      {secondaryAction != null && (
        <button
          type="button"
          onClick={secondaryAction.onClick}
          aria-label={secondaryAction.label}
          title={secondaryAction.label}
          className={cn(composerChipCloseClassName, focusRing)}
        >
          <CornerUpLeft className="size-3" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label={localize('com_ui_attach_remove')}
        className={composerChipCloseClassName}
      >
        <span aria-hidden="true">{CLOSE_GLYPH}</span>
      </button>
    </div>
  );
}
