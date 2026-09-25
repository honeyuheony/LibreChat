import { memo, useMemo } from 'react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import {
  getConfigDefaults,
  Constants,
  PermissionTypes,
  Permissions,
} from 'librechat-data-provider';
import ConversationTitleMenu from './Menus/ConversationTitleMenu';
import { OpenSidebar, NewChat, HeaderMenu } from './Menus';
import { TemporaryChatIndicator } from './TemporaryChat';
import { useGetStartupConfig } from '~/data-provider';
import ExportAndShareMenu from './ExportAndShareMenu';
import SubagentThreadLink from './SubagentThreadLink';
import { useTraceControl } from './Trace';
import { useHasAccess } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

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
  const { data: startupConfig } = useGetStartupConfig();
  const navVisible = useRecoilValue(store.sidebarExpanded);
  const isSubmitting = useRecoilValue(store.isSubmittingFamily(0));

  /** The mobile row only offers a new chat when there is one to leave. Read
   *  from the route rather than the context conversation, which still holds the
   *  previous chat for a render after a history or link navigation. An unsaved
   *  conversation has no id in the route yet, so absence counts as new too. */
  const { conversationId: routeConversationId } = useParams();
  const isNewChat = routeConversationId == null || routeConversationId === Constants.NEW_CONVO;

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
    <div className="absolute top-0 z-10 flex h-[52px] w-full items-center gap-2 bg-gradient-to-b from-presentation via-presentation/70 to-transparent p-2 font-semibold text-text-primary md:from-presentation/80 md:via-presentation/50 2xl:from-presentation/0 2xl:via-transparent">
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
      </div>

      <div className={cn('flex flex-shrink-0 items-center gap-2', hiddenBehindNav)}>
        {hasAccessToTemporaryChat === true && <TemporaryChatIndicator />}
        {!isNewChat && <NewChat className="md:hidden" />}
        <HeaderMenu startupConfig={startupConfig} trace={trace} className="md:hidden" />
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
