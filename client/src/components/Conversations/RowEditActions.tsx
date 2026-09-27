import { memo, useRef, useState } from 'react';
import DeleteButton from './ConvoOptions/DeleteButton';
import { useLocalize } from '~/hooks';

const RENAME_GLYPH = '✎';
const DELETE_GLYPH = '✕';

const actionClassName =
  'flex size-[22px] items-center justify-center rounded-theme-control bg-surface-active text-[13px] text-text-muted transition-colors hover:bg-border-medium hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary';

/** 대화 행에서 이름은 바로 바꾸고, 삭제는 확인 대화상자를 거친다. */
function RowEditActions({
  conversationId,
  title,
  onRename,
  retainView,
}: {
  conversationId: string;
  title: string;
  onRename: () => void;
  retainView: () => void;
}) {
  const localize = useLocalize();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        data-testid="convo-rename-button"
        aria-label={localize('com_ui_rename')}
        title={localize('com_ui_rename')}
        className={actionClassName}
        onClick={(e) => {
          e.stopPropagation();
          onRename();
        }}
      >
        <span aria-hidden="true">{RENAME_GLYPH}</span>
      </button>
      <button
        ref={deleteButtonRef}
        type="button"
        data-testid="convo-delete-button"
        aria-label={localize('com_ui_delete')}
        title={localize('com_ui_delete')}
        className={actionClassName}
        onClick={(e) => {
          e.stopPropagation();
          setShowDeleteDialog(true);
        }}
      >
        <span aria-hidden="true">{DELETE_GLYPH}</span>
      </button>
      {showDeleteDialog && (
        /* 포털 안 클릭도 React 트리를 따라 행까지 전파되어 삭제할 대화를 열 수 있다. */
        <span className="contents" onClick={(e) => e.stopPropagation()}>
          <DeleteButton
            title={title}
            retainView={retainView}
            triggerRef={deleteButtonRef}
            showDeleteDialog={showDeleteDialog}
            conversationId={conversationId}
            setShowDeleteDialog={setShowDeleteDialog}
          />
        </span>
      )}
    </div>
  );
}

export default memo(RowEditActions);
