import React, { memo, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useDrag } from 'react-dnd';
import { Link2 } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { useParams } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import { Spinner, useToastContext, useMediaQuery } from '@librechat/client';
import type { TConversation } from 'librechat-data-provider';
import type { ConversationDragItem } from './dnd';
import {
  useActiveJobStatus,
  useGetStartupConfig,
  usePinConversationMutation,
  useUpdateConversationMutation,
} from '~/data-provider';
import { useNavigateToConvo, useLocalize, useShiftKey } from '~/hooks';
import ConversationEndpointIcon from './ConversationEndpointIcon';
import { focusableInRow, resolveRowBeside } from './focus';
import { areConversationRenderPropsEqual } from './utils';
import { cn, logger, setDocumentTitle } from '~/utils';
import { NotificationSeverity } from '~/common';
import { CONVERSATION_DRAG_TYPE } from './dnd';
import RowEditActions from './RowEditActions';
import ConvoActions from './ConvoActions';
import UnpinButton from './UnpinButton';
import RenameForm from './RenameForm';
import ConvoLink from './ConvoLink';
import store from '~/store';

interface ConversationProps {
  conversation: TConversation;
  retainView: () => void;
  toggleNav: (afterSlide?: () => void) => void;
  isGenerating?: boolean;
  /** Sidebar rows double as drag sources for filing the chat into a project;
   *  other surfaces leave this off. */
  draggable?: boolean;
  /** Lets a wrapper that owns its own drag source release it while the title is
   *  being edited, the way this row releases its own. */
  onRenamingChange?: (renaming: boolean) => void;
  /** Shortcuts an owning list handles for this row, declared on its focusable
   *  element so they are announced rather than left to be discovered. */
  keyShortcuts?: string;
  /** 대화 기록에서 제목만 보이고, 포인터를 올리면 이름 변경·삭제 동작이 나타나며 응답 중에는 생성 상태를 표시한다. */
  editActions?: boolean;
}

function Conversation({
  conversation,
  retainView,
  toggleNav,
  isGenerating = false,
  draggable = false,
  onRenamingChange,
  keyShortcuts,
  editActions = false,
}: ConversationProps) {
  const params = useParams();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo();
  const currentConvoId = useMemo(() => params.conversationId, [params.conversationId]);
  const updateConvoMutation = useUpdateConversationMutation(currentConvoId ?? '');
  const unpinMutation = usePinConversationMutation();
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  /* A deployment with shared links off leaves existing links in the database but stops
     serving them, so the row must not advertise one that no longer resolves. */
  const { data: startupConfig } = useGetStartupConfig();
  const sharedLinksEnabled = startupConfig?.sharedLinksEnabled === true;
  /* 재개 후에도 isGenerating이 true라 props만으로 감지할 수 없어 행에서 상태를 직접 구독한다. */
  const activeJobStatus = useActiveJobStatus(conversation.conversationId);
  /* 승인을 기다리는 실행은 채팅 모드와 무관하게 모든 대화 행에 표시한다. */
  const awaitingApproval = isGenerating && activeJobStatus === 'requires_action';
  const isSharedBadgeVisible = conversation.isShared === true && sharedLinksEnabled;
  const isShiftHeld = useShiftKey();
  const { conversationId, title = '' } = conversation;

  const [titleInput, setTitleInput] = useState(title || '');
  const [renaming, setRenamingState] = useState(false);
  const [isPopoverActive, setIsPopoverActive] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  // Lazy-load ConvoOptions to avoid running heavy hooks for all conversations
  const [hasInteracted, setHasInteracted] = useState(false);

  const previousTitle = useRef(title);
  const containerRef = useRef<HTMLDivElement>(null);

  const onRenamingChangeRef = useRef(onRenamingChange);
  onRenamingChangeRef.current = onRenamingChange;

  const setRenaming = useCallback((next: boolean) => {
    setRenamingState(next);
    onRenamingChangeRef.current?.(next);
  }, []);

  /* A row can be removed mid-rename, for instance by unpinning the same chat
   * from the project list that renders it too. Without this the owner would
   * keep treating the row as renaming and, once it came back, leave its drag
   * source released for the rest of the section's life. */
  useEffect(
    () => () => {
      onRenamingChangeRef.current?.(false);
    },
    [],
  );

  /* HTML5 drag needs a hover-capable pointer: connecting the source on touch
   * stamps `draggable="true"` on the row, and iOS Safari then hands taps to the
   * drag recognizer instead of synthesizing a click, so the row would only
   * select on the second tap. A `draggable` ancestor also swallows drag-select
   * inside the rename input, so the source is released while renaming. */
  const canHoverPointer = useMediaQuery('(hover: hover)');
  const [, dragConnector] = useDrag<ConversationDragItem, unknown, unknown>({
    type: CONVERSATION_DRAG_TYPE,
    item: () => ({
      conversationId: conversationId ?? '',
      chatProjectId: conversation.chatProjectId ?? null,
      pinned: conversation.pinned === true,
    }),
  });
  dragConnector(draggable && canHoverPointer && !renaming ? containerRef : null);

  useEffect(() => {
    if (title !== previousTitle.current) {
      setTitleInput(title as string);
      previousTitle.current = title;
    }
  }, [title]);

  const isActiveConvo = useMemo(() => {
    if (conversationId === Constants.NEW_CONVO) {
      return currentConvoId === Constants.NEW_CONVO;
    }

    if (currentConvoId !== Constants.NEW_CONVO) {
      return currentConvoId === conversationId;
    } else {
      const latestConvo = activeConvos?.[0];
      return latestConvo === conversationId;
    }
  }, [currentConvoId, conversationId, activeConvos]);

  const handleRename = () => {
    setIsPopoverActive(false);
    setTitleInput(title as string);
    setRenaming(true);
  };

  const handleRenameSubmit = async (newTitle: string) => {
    if (!conversationId || newTitle === title) {
      setRenaming(false);
      return;
    }

    try {
      await updateConvoMutation.mutateAsync({
        conversationId,
        title: newTitle.trim() || localize('com_ui_untitled'),
      });
      setRenaming(false);
    } catch (error) {
      logger.error('Error renaming conversation', error);
      setTitleInput(title as string);
      showToast({
        message: localize('com_ui_rename_failed'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
      setRenaming(false);
    }
  };

  const handleCancelRename = () => {
    setTitleInput(title as string);
    setRenaming(false);
  };

  /* One-way: a row that has been reached keeps its overflow control mounted for
   * as long as the row itself lives. Resetting this on leave unmounted the
   * control and remounted it on the next entry, one frame after the row's hover
   * had already revealed its slot — so the button arrived a frame late and
   * restarted its hover fill from transparent every time the pointer crossed
   * the row's edge, which reads as a flicker.
   *
   * The cost is what the row's own lifetime is: the chats list unmounts a row
   * as it scrolls out, while the Pinned section mounts every pinned row at
   * once, so there a pointer crossing the list leaves one `ConvoOptions` per
   * row it touched, standing until the section unmounts. That is bounded by
   * the pin count the user chose, and a control that unmounts instead is what
   * this comment's first paragraph describes. */
  const handleMouseEnter = useCallback(() => {
    setHasInteracted(true);
  }, []);

  /* Matches the favorites' row-level unpin: one click on the pin badge, no
   * menu digging. The row unmounts once the pinned refetch lands, so focus is
   * handed to a neighbouring row first. Where that row is has to be resolved
   * before the mutation, not in its callback: by then the refetch may already
   * have unmounted this row and cleared the ref the search starts from. */
  const unpinConvo = useCallback(() => {
    if (!conversationId) {
      return;
    }
    const row = containerRef.current;
    /* Outside the pinned list there is no successor, because the row stays put.
     * The pin badge that had focus does not, though, so focus moves to the
     * row's own link rather than falling to the document. */
    const successor =
      row?.contains(document.activeElement) === true
        ? (resolveRowBeside(row) ?? focusableInRow(row))
        : null;
    unpinMutation.mutate(
      { conversationId, pinned: false },
      {
        onSuccess: () => {
          const activeElement = document.activeElement;
          const focusInRow = row?.contains(activeElement) === true;
          const rowRemovedFocus =
            row?.isConnected === false &&
            (activeElement === document.body || activeElement === document.documentElement);
          if (successor?.isConnected && (focusInRow || rowRemovedFocus)) {
            successor.focus();
          }
        },
        onError: () => {
          showToast({
            message: localize('com_ui_unpin_error'),
            severity: NotificationSeverity.ERROR,
            showIcon: true,
          });
        },
      },
    );
  }, [conversationId, unpinMutation, showToast, localize]);

  const handlePopoverOpenChange = useCallback((open: boolean) => {
    setIsPopoverActive(open);
  }, []);

  const handleNavigation = (ctrlOrMetaKey: boolean) => {
    if (ctrlOrMetaKey && !isGenerating) {
      toggleNav();
      const baseUrl = window.location.origin;
      const path = `/c/${conversationId}`;
      window.open(baseUrl + path, '_blank');
      return;
    }

    if (currentConvoId === conversationId || isPopoverActive) {
      return;
    }

    /** The navigation rides `afterSlide`: run synchronously it flushes the
     * conversation-switch commit in the tap's task, stalling the drawer's
     * first frame — the exact delay the animated toggle exists to avoid. */
    toggleNav(() => {
      setDocumentTitle(title);

      navigateToConvo(conversation, {
        currentConvoId,
      });
    });
  };

  const convoOptionsProps = {
    title,
    isPinned: conversation.pinned,
    /* The row's own state, not the list's: the sidebar shows unarchived pins beside an
       archived list, and the previous page's rows stay on screen while the next loads. */
    isArchived: conversation.isArchived === true,
    retainView,
    renameHandler: handleRename,
    isActiveConvo,
    conversationId,
    chatProjectId: conversation.chatProjectId,
    isPopoverActive,
    onOpenChange: handlePopoverOpenChange,
    isShiftHeld: isActiveConvo ? isShiftHeld : false,
  };

  const generatingSpinner = (
    <span role="img" aria-label={localize('com_ui_generating')}>
      <Spinner className="h-5 w-5 flex-shrink-0 text-text-primary" />
    </span>
  );

  const awaitingApprovalBadge = (
    <span className="flex items-center gap-1.5 whitespace-nowrap pr-1 text-xs text-text-muted">
      <span aria-hidden="true" className="size-[7px] rounded-full bg-status-error-strong" />
      {localize('com_ui_convo_awaiting_approval')}
    </span>
  );

  /* The slot takes its width from the row's hover, not from its content. The
   * overflow menu mounts a tick after the pointer arrives (see `ConvoActions`),
   * and a content-sized slot grew at that moment, pulling the unpin badge a
   * button's width leftwards out from under the pointer: the badge's fill,
   * already fading in, handed off to whichever control had slid into its place.
   * Reserving the width up front leaves every control where it was drawn. */
  let actionVisibilityClassName =
    'pointer-events-none w-0 scale-x-0 opacity-0 group-focus-within:pointer-events-auto group-focus-within:scale-x-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:scale-x-100 group-hover:opacity-100';
  let actionWidthClassName = isSmallScreen
    ? 'group-focus-within:w-9 group-hover:w-9'
    : 'group-focus-within:w-7 group-hover:w-7';
  if (awaitingApproval) {
    actionVisibilityClassName = 'pointer-events-none scale-x-100 opacity-100';
    actionWidthClassName = '';
  } else if (isGenerating) {
    actionVisibilityClassName = 'pointer-events-none w-5 scale-x-100 opacity-100';
    actionWidthClassName = '';
  } else if (isPopoverActive || isActiveConvo || isSmallScreen) {
    /** Touch has no hover, so a reveal-on-hover menu is unreachable there. */
    actionVisibilityClassName = 'pointer-events-auto scale-x-100 opacity-100';
    /** Shift over the active row swaps the menu for archive and delete. */
    if (!isPopoverActive && isActiveConvo && isShiftHeld) {
      actionWidthClassName = 'w-[60px]';
    } else {
      actionWidthClassName = isSmallScreen ? 'w-9' : 'w-7';
    }
  }

  let actionContent: React.ReactNode = null;
  if (awaitingApproval) {
    actionContent = awaitingApprovalBadge;
  } else if (editActions) {
    if (isGenerating) {
      actionVisibilityClassName = 'pointer-events-none scale-x-100 opacity-100';
      actionWidthClassName = '';
      actionContent = (
        <span className="flex items-center gap-1.5 whitespace-nowrap pr-1 text-xs text-text-muted">
          <span aria-hidden="true" className="size-[7px] rounded-full bg-amber-500" />
          {localize('com_ui_convo_generating')}
        </span>
      );
    } else if (!renaming && conversationId) {
      /* 이름 변경·삭제 동작은 데스크톱에서 포인터·키보드 포커스가 있을 때만, 터치 화면에서 활성 대화에 계속 보인다. */
      actionVisibilityClassName =
        'pointer-events-none w-0 scale-x-0 opacity-0 group-focus-within:pointer-events-auto group-focus-within:scale-x-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:scale-x-100 group-hover:opacity-100';
      actionWidthClassName = 'group-focus-within:w-12 group-hover:w-12';
      if (isSmallScreen && isActiveConvo) {
        actionVisibilityClassName = 'pointer-events-auto scale-x-100 opacity-100';
        actionWidthClassName = 'w-12';
      }
      actionContent = (
        <RowEditActions
          conversationId={conversationId}
          title={title ?? ''}
          onRename={handleRename}
          retainView={retainView}
        />
      );
    }
  } else if (isGenerating) {
    actionContent = generatingSpinner;
  } else if (!renaming) {
    actionContent = <ConvoActions {...convoOptionsProps} hasInteracted={hasInteracted} />;
  }

  let rowStateClassName = editActions
    ? 'text-text-secondary hover:bg-surface-hover'
    : 'hover:bg-surface-active-alt';
  if (isActiveConvo || isPopoverActive) {
    rowStateClassName = editActions
      ? 'bg-surface-active-alt'
      : 'bg-surface-active-alt before:absolute before:bottom-1 before:left-0 before:top-1 before:w-0.5 before:rounded-full before:bg-text-primary';
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative flex h-12 w-full items-center rounded-lg outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-primary',
        editActions ? 'md:h-[34.5px]' : 'md:h-9',
        editActions && 'rounded-theme-control text-[15px]',
        rowStateClassName,
      )}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') {
          setIsHovered(true);
        }
      }}
      onPointerLeave={() => setIsHovered(false)}
      onPointerCancel={() => setIsHovered(false)}
      onMouseEnter={handleMouseEnter}
      onFocus={handleMouseEnter}
      onClick={(e) => {
        if (renaming) {
          return;
        }
        if (e.button === 0) {
          handleNavigation(e.ctrlKey || e.metaKey);
        }
      }}
      style={{ cursor: renaming ? 'default' : 'pointer' }}
      data-testid="convo-item"
    >
      {renaming ? (
        <RenameForm
          titleInput={titleInput}
          setTitleInput={setTitleInput}
          onSubmit={handleRenameSubmit}
          onCancel={handleCancelRename}
          localize={localize}
        />
      ) : (
        <ConvoLink
          isActiveConvo={isActiveConvo}
          isPopoverActive={isPopoverActive}
          isHovered={isHovered}
          isSharedBadgeVisible={isSharedBadgeVisible}
          title={title}
          onRename={handleRename}
          isSmallScreen={isSmallScreen}
          localize={localize}
          keyShortcuts={keyShortcuts}
        >
          {!editActions && (
            <ConversationEndpointIcon conversation={conversation} size={20} context="menu-item" />
          )}
        </ConvoLink>
      )}
      {isSharedBadgeVisible && (
        <Link2 className="icon-sm mr-1 shrink-0 text-text-secondary" aria-hidden="true" />
      )}
      {conversation.pinned === true && (
        <UnpinButton
          testId="convo-unpin-button"
          className="mr-1"
          keepVisible={isPopoverActive}
          onClick={(e) => {
            e.stopPropagation();
            unpinConvo();
          }}
        />
      )}
      <div
        className={cn(
          'mr-1 flex shrink-0 origin-left items-center justify-center',
          actionVisibilityClassName,
          actionWidthClassName,
        )}
        // Removing aria-hidden to fix accessibility issue: ARIA hidden element must not be focusable or contain focusable elements
        // but not sure what its original purpose was, so leaving the property commented out until it can be cleared safe to delete.
        // aria-hidden={!(isPopoverActive || isActiveConvo)}
      >
        {/* Only render ConvoOptions when user interacts (hover/focus) or for active conversation */}
        {actionContent}
      </div>
    </div>
  );
}

export default memo(Conversation, areConversationRenderPropsEqual);
