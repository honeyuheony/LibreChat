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
import type { TranslationKeys } from '~/hooks';
import useTaskRunState, {
  TASK_STATUS_DOT,
  TASK_STATUS_LABEL,
} from '~/components/Task/useTaskRunState';
import { useGetMessagesByConvoId, useGetStartupConfig } from '~/data-provider';
import { useAuthContext, useHasAccess, useLocalize } from '~/hooks';
import ConversationTitleMenu from './Menus/ConversationTitleMenu';
import { topBarSurfaceClassName } from '~/components/ui/topbar';
import { OpenSidebar, NewChat, HeaderMenu } from './Menus';
import { TemporaryChatIndicator } from './TemporaryChat';
import ExportAndShareMenu from './ExportAndShareMenu';
import SubagentThreadLink from './SubagentThreadLink';
import { useTraceControl } from './Trace';
import { cn } from '~/utils';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

/** 같은 파일을 여러 번 첨부해도 헤더에는 고유 파일 수를 표시한다. */
const countAttachedFiles = (messages: TMessage[]) =>
  new Set(messages.flatMap((message) => (message.files ?? []).map((file) => file.file_id ?? '')))
    .size;

/** CSS로 분기해 첫 render 뒤 useMediaQuery가 바뀌며 행이 튀는 현상을 막는다. */
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
  /** 대화 화면에서 이미 불러온 값을 다시 요청하지 않고 읽는다. */
  const { data: documentCount = 0 } = useGetMessagesByConvoId<number>(routeConversationId ?? '', {
    enabled: false,
    select: countAttachedFiles,
  });

  /** 작업 도구를 쓴 대화는 작업 패널과 같은 상태를 보여 헤더와 내용이 어긋나지 않게 한다. */
  const task = useTaskRunState(isNewChat ? '' : routeConversationId);
  let statusDot = isSubmitting ? 'bg-amber-500' : 'bg-green-600';
  let statusLabel: TranslationKeys = isSubmitting ? 'com_ui_convo_generating' : 'com_ui_convo_done';
  if (task.call != null) {
    statusDot = TASK_STATUS_DOT[task.status];
    statusLabel = TASK_STATUS_LABEL[task.status];
  }

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
    <div
      className={cn(
        'absolute top-0 z-10 flex h-12 w-full items-center gap-2 p-2 text-[14.5px] text-text-secondary md:pl-3 md:pr-6',
        topBarSurfaceClassName,
      )}
    >
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
            <span aria-hidden="true" className={cn('size-[7px] rounded-full', statusDot)} />
            {localize(statusLabel)}
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
