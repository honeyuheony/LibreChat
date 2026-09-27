import { useContext, useMemo } from 'react';
import { Button } from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import { Constants, Permissions, PermissionTypes, splitMCPToolKey } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ContextType } from 'react';
import type { BuilderEntryState } from '~/components/Skills/builder';
import type { TranslationKeys } from '~/hooks';
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

/** MCP servers the conversation's tool calls went through, each once, in first-use order. */
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

/** The newest task result in the conversation and the answer that carries it. */
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

/**
 * "Do you do this again?" card under a finished task. It opens the agent editor with the
 * request, the result the editor reads its settled cells from, and the MCP servers used.
 * The title and body keys are not in the translation files yet, so they are cast.
 */
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
      className="mt-2.5 flex flex-wrap items-center gap-3 rounded-xl border border-border-brand bg-surface-brand-subtle px-3.5 py-3"
      data-testid="task-save-offer"
    >
      <div className="min-w-0 flex-1 text-[0.875rem] leading-relaxed text-text-primary">
        <b className="block">{localize('com_ui_task_save_agent_title' as TranslationKeys)}</b>
        {localize('com_ui_task_save_agent_body' as TranslationKeys)}
      </div>
      <Button size="sm" variant="submit" onClick={save}>
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
  /** Offered for a request typed in the chat, not for one that already ran a saved agent. */
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

/**
 * The save offer at the end of an answer, the way the wireframe appends it once the task
 * is done: only under the answer that carries the conversation's newest task result, so
 * a conversation shows it once. Without an open chat (search results) it renders nothing.
 */
export function MessageSaveOffer({ messageId }: { messageId: string }) {
  const chatContext = useContext(ChatContext);
  if (chatContext == null) {
    return null;
  }
  return <ChatSaveOffer messageId={messageId} chatContext={chatContext} />;
}
