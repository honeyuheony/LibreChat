import { useContext, useMemo } from 'react';
import { Button } from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import { Constants, Permissions, PermissionTypes, splitMCPToolKey } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ContextType } from 'react';
import type { BuilderEntryState } from '~/components/Skills/builder';
import { BUILDER_PATH } from '~/components/Chat/Input/AgentSuggestChips';
import { useTaskResultQuery } from '~/data-provider/Tasks/queries';
import { useGetMessagesByConvoId } from '~/data-provider';
import { ChatContext } from '~/Providers/ChatContext';
import { useHasAccess, useLocalize } from '~/hooks';
import { requestForResult } from './TaskResultCard';
import { taskResultsOf } from './TaskPlanCard';

function toolCallName(part: unknown): string | undefined {
  const name = (part as { tool_call?: { name?: unknown } } | null)?.tool_call?.name;
  return typeof name === 'string' ? name : undefined;
}

/** 대화의 tool call에서 MCP 서버를 처음 사용한 순서대로 한 번씩 가져온다. */
export function usedConnectors(messages: TMessage[]): string[] {
  const servers = new Set<string>();
  for (const message of messages) {
    for (const part of message.content ?? []) {
      const name = toolCallName(part);
      if (!name?.includes(Constants.mcp_delimiter)) {
        continue;
      }
      const [, server] = splitMCPToolKey(name);
      if (server) {
        servers.add(server);
      }
    }
  }
  return [...servers];
}

type TaskSaveOfferProps = {
  conversationId: string;
  resultId: string;
  request: string;
  getMessages: () => TMessage[] | undefined;
};

type LatestResult = { messageId: string; resultId: string };

/** 대화에서 가장 최근 task 결과와 그 결과를 담은 답변을 찾는다. */
function latestTaskResult(messages: TMessage[] | undefined): LatestResult | null {
  let latest: LatestResult | null = null;
  for (const message of messages ?? []) {
    const results = taskResultsOf(message.attachments);
    if (results.length > 0) {
      latest = { messageId: message.messageId, resultId: results[results.length - 1].resultId };
    }
  }
  return latest;
}

export default function TaskSaveOffer({
  conversationId,
  resultId,
  request,
  getMessages,
}: TaskSaveOfferProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const save = () => {
    const state: BuilderEntryState = {
      from: 'chat',
      conversationId,
      text: request,
      taskResultId: resultId,
      connectors: usedConnectors(getMessages() ?? []),
    };
    navigate(BUILDER_PATH, { state });
  };
  return (
    <div
      className="mt-2.5 flex flex-wrap items-center gap-3 rounded-2xl border border-border-brand bg-transparent px-3.5 py-3"
      data-testid="task-save-offer"
    >
      <div className="min-w-0 flex-1 text-[13px] leading-[1.5] text-text-secondary-alt">
        <b className="block text-sm font-bold text-text-primary">
          {localize('com_ui_task_save_agent_title')}
        </b>
        {localize('com_ui_task_save_agent_body')}
      </div>
      <Button
        size="pill"
        variant="submit"
        onClick={save}
        className="h-[27px] min-w-[153px] px-[11px] py-[3px] leading-normal"
      >
        {localize('com_skills_chat_save_as_agent')}
      </Button>
    </div>
  );
}

function ChatSaveOffer({
  messageId,
  chatContext,
}: {
  messageId: string;
  chatContext: NonNullable<ContextType<typeof ChatContext>>;
}) {
  const conversationId = chatContext.conversation?.conversationId ?? '';
  const canCreateSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.CREATE,
  });
  const { data: latest } = useGetMessagesByConvoId(conversationId, {
    enabled: false,
    select: latestTaskResult,
  });
  const resultId =
    canCreateSkills && conversationId !== '' && latest?.messageId === messageId
      ? latest.resultId
      : null;
  const { data: result } = useTaskResultQuery(resultId);
  /** 직접 입력한 요청에만 제안을 표시하고, 이미 agent가 실행한 요청은 제외한다. */
  const request = useMemo(() => {
    if (resultId == null || result == null) {
      return undefined;
    }
    const message = requestForResult(chatContext.getMessages?.() ?? [], result.createdAt);
    const text = message?.text?.trim();
    return text && (message?.manualSkills?.length ?? 0) === 0 ? text : undefined;
  }, [resultId, result, chatContext]);

  if (resultId == null || request == null) {
    return null;
  }
  return (
    <TaskSaveOffer
      conversationId={conversationId}
      resultId={resultId}
      request={request}
      getMessages={() => chatContext.getMessages?.()}
    />
  );
}

/** 채팅의 최신 task 결과를 담은 답변 아래에만 저장 제안을 한 번 표시한다. */
export function MessageSaveOffer({ messageId }: { messageId: string }) {
  const chatContext = useContext(ChatContext);
  if (chatContext == null) {
    return null;
  }
  return <ChatSaveOffer messageId={messageId} chatContext={chatContext} />;
}
