import { Button } from '@librechat/client';
import { useNavigate } from 'react-router-dom';
import { Constants, splitMCPToolKey } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { BuilderEntryState } from '~/components/Skills/builder';
import type { TranslationKeys } from '~/hooks';
import { BUILDER_PATH } from '~/components/Chat/Input/AgentSuggestChips';
import { useLocalize } from '~/hooks';

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
