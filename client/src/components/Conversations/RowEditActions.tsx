import { memo, useRef, useState } from 'react';
import DeleteButton from './ConvoOptions/DeleteButton';
import { useLocalize } from '~/hooks';

/** The wireframe draws the controls as these two characters rather than icons. */
const RENAME_GLYPH = '✎';
const DELETE_GLYPH = '✕';

const actionClassName =
  'flex size-[22px] items-center justify-center rounded-theme-control bg-surface-active text-[13px] text-text-muted transition-colors hover:bg-border-medium hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary';

/** The wireframe's two hover controls on a history row: ✎ renames in place, ✕ asks before deleting. */
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
        /* The dialog portals out, but React still bubbles its clicks to the row, which
           would open the conversation being deleted. */
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
