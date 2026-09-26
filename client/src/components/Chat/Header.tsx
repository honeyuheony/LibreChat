import { memo, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import {
  getConfigDefaults,
  Constants,
  PermissionTypes,
  Permissions,
} from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useGetMessagesByConvoId, useGetStartupConfig } from '~/data-provider';
import { useAuthContext, useHasAccess, useLocalize } from '~/hooks';
import ConversationTitleMenu from './Menus/ConversationTitleMenu';
import { OpenSidebar, NewChat, HeaderMenu } from './Menus';
import { TemporaryChatIndicator } from './TemporaryChat';
import ExportAndShareMenu from './ExportAndShareMenu';
import SubagentThreadLink from './SubagentThreadLink';
import { useTraceControl } from './Trace';
import { cn } from '~/utils';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

/** Distinct files attached anywhere in the conversation, for the header's 「문서 N」. */
const countAttachedFiles = (messages: TMessage[]) =>
  new Set(messages.flatMap((message) => (message.files ?? []).map((file) => file.file_id ?? '')))
    .size;

/**
 * The conversation's title on the left and sharing on the right. The model
 * picker lives in the composer; the remaining conversation actions (trace,
 * temporary chat, bookmarks, compare) stay in the mobile overflow menu.
 * Branching is CSS-only — `useMediaQuery` resolves after paint and would pop
 * the row a frame late on every mount.
 */
function Header({
  parentConversationId,
  readOnly = false,
}: {
  parentConversationId?: string;
  readOnly?: boolean;
}) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const navVisible = useRecoilValue(store.sidebarExpanded);
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));

  /** The mobile row only offers a new chat when there is one to leave. Read
   *  from the route rather than the context conversation, which still holds the
   *  previous chat for a render after a history or link navigation. An unsaved
   *  conversation has no id in the route yet, so absence counts as new too. */
  const { conversationId: routeConversationId } = useParams();
  const isNewChat = routeConversationId == null || routeConversationId === Constants.NEW_CONVO;
  /** Reads what the conversation view already loaded rather than asking again. */
  const { data: documentCount = 0 } = useGetMessagesByConvoId<number>(routeConversationId ?? '', {
    enabled: false,
    select: countAttachedFiles,
  });

  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  const hasAccessToTemporaryChat = useHasAccess({
    permissionType: PermissionTypes.TEMPORARY_CHAT,
    permission: Permissions.USE,
  });

  /** Child threads are view-only records of their parent's run and have no trace of their own. */
  const trace = useTraceControl({
    conversationId: isNewChat ? null : routeConversationId,
    traceViewer: interfaceConfig.traceViewer,
    isSubmitting,
    enabled: parentConversationId == null,
  });

  /** The drawer covers the header on mobile; keep its controls out of the tab order. */
  const hiddenBehindNav = navVisible === true && 'max-md:hidden';

  return (
    <div className="absolute top-0 z-10 flex h-12 w-full items-center gap-2 border-b border-border-light bg-presentation/70 p-2 text-[14.5px] text-text-secondary backdrop-blur-md md:px-4">
      <div className="flex flex-shrink-0 items-center md:hidden">
        <OpenSidebar testId="header-open-sidebar-button" />
      </div>

      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 md:pl-3 md:transition-all md:duration-200 md:ease-in-out',
          hiddenBehindNav,
        )}
      >
        {parentConversationId != null && (
          <SubagentThreadLink threadId={parentConversationId} labelClassName="hidden lg:inline" />
        )}
        {!isNewChat && !readOnly && <ConversationTitleMenu />}
        {!isNewChat && documentCount > 0 && (
          <span className="hidden flex-shrink-0 items-center gap-2 md:flex">
            <span aria-hidden="true">·</span>
            {localize('com_ui_header_documents', { 0: documentCount })}
          </span>
        )}
      </div>

      <div className={cn('flex flex-shrink-0 items-center gap-2', hiddenBehindNav)}>
        {hasAccessToTemporaryChat === true && <TemporaryChatIndicator />}
        {!isNewChat && <NewChat className="md:hidden" />}
        <HeaderMenu startupConfig={startupConfig} trace={trace} className="md:hidden" />
        {isNewChat && (
          <span className="hidden text-text-tertiary md:inline">
            {user?.organization
              ? `${user.organization} · ${localize('com_ui_home_notice')}`
              : localize('com_ui_home_notice')}
          </span>
        )}
        {!isNewChat && (
          <span className="hidden items-center gap-1.5 text-text-tertiary md:flex">
            <span
              aria-hidden="true"
              className={cn(
                'size-[7px] rounded-full',
                isSubmitting ? 'bg-amber-500' : 'bg-green-600',
              )}
            />
            {localize(isSubmitting ? 'com_ui_convo_generating' : 'com_ui_convo_done')}
          </span>
        )}
        <div className="hidden items-center gap-2 md:flex">
          <ExportAndShareMenu isSharedButtonEnabled={startupConfig?.sharedLinksEnabled ?? false} />
        </div>
      </div>
    </div>
  );
}

const MemoizedHeader = memo(Header);
MemoizedHeader.displayName = 'Header';

export default MemoizedHeader;
