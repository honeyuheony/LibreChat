import { memo, useState, useCallback, useSyncExternalStore } from 'react';
import { useToastContext } from '@librechat/client';
import { useQueryClient } from '@tanstack/react-query';
import { Constants, QueryKeys } from 'librechat-data-provider';
import type { InfiniteData } from '@tanstack/react-query';
import type { ConversationCursorData } from '~/utils/convos';
import { ConvoOptions } from '~/components/Conversations/ConvoOptions';
import { useUpdateConversationMutation } from '~/data-provider';
import RenameForm from '~/components/Conversations/RenameForm';
import { findConversationInInfinite, logger } from '~/utils';
import { NotificationSeverity } from '~/common';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';

const noop = () => {};

/**
 * The title as the conversation list holds it. Title generation and rename write
 * the list caches, while the chat context keeps the title it loaded with.
 */
function useListedConversationTitle(conversationId: string | null): string | undefined {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
    [queryClient],
  );
  const readTitle = useCallback(() => {
    if (!conversationId) {
      return undefined;
    }
    const lists = queryClient.getQueriesData<InfiniteData<ConversationCursorData>>([
      QueryKeys.allConversations,
    ]);
    for (const [, data] of lists) {
      const found = findConversationInInfinite(data, conversationId);
      if (found?.title != null) {
        return found.title;
      }
    }
    return undefined;
  }, [queryClient, conversationId]);
  return useSyncExternalStore(subscribe, readTitle);
}

/**
 * The conversation header's title. Pressing it opens the same options the
 * sidebar row carries (rename, share, archive, delete, ...), and rename edits
 * the title in place.
 */
function ConversationTitleMenu() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { conversation } = useChatContext();
  const conversationId = conversation?.conversationId ?? null;
  const listedTitle = useListedConversationTitle(conversationId);
  const title = (listedTitle ?? conversation?.title)?.trim() ?? '';
  const updateConvoMutation = useUpdateConversationMutation(conversationId ?? '');

  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleInput, setTitleInput] = useState(title);

  const startRename = useCallback(() => {
    setIsPopoverActive(false);
    setTitleInput(title);
    setRenaming(true);
  }, [title]);

  const submitRename = useCallback(
    async (newTitle: string) => {
      if (!conversationId || newTitle === title) {
        setRenaming(false);
        return;
      }
      try {
        await updateConvoMutation.mutateAsync({
          conversationId,
          title: newTitle.trim() || localize('com_ui_untitled'),
        });
      } catch (error) {
        logger.error('Error renaming conversation', error);
        showToast({
          message: localize('com_ui_rename_failed'),
          severity: NotificationSeverity.ERROR,
          showIcon: true,
        });
      }
      setRenaming(false);
    },
    [conversationId, title, updateConvoMutation, localize, showToast],
  );

  if (!conversationId || conversationId === Constants.NEW_CONVO || title === '') {
    return null;
  }

  if (renaming) {
    return (
      <div className="relative h-9 w-full max-w-md">
        <RenameForm
          titleInput={titleInput}
          setTitleInput={setTitleInput}
          onSubmit={submitRename}
          onCancel={() => setRenaming(false)}
          localize={localize}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 max-w-md">
      <ConvoOptions
        conversationId={conversationId}
        chatProjectId={conversation?.chatProjectId}
        title={title}
        isPinned={conversation?.pinned === true}
        isArchived={conversation?.isArchived === true}
        retainView={noop}
        renameHandler={startRename}
        isPopoverActive={isPopoverActive}
        setIsPopoverActive={setIsPopoverActive}
        isActiveConvo={true}
        triggerLabel={title}
      />
    </div>
  );
}

export default memo(ConversationTitleMenu);
