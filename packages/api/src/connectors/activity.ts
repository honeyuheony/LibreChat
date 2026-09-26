import { logger } from '@librechat/data-schemas';
import { Constants, ContentTypes } from 'librechat-data-provider';
import type { ConnectorActivityItem } from 'librechat-data-provider';
import type { Request, Response } from 'express';

/** Unmeasured: enough recent turns to fill a page of rows, since one turn often holds several calls. */
const MESSAGES_SCANNED = 40;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

export interface ToolCallMessage {
  conversationId?: string | null;
  createdAt?: Date | string | null;
  content?: Array<{ type?: string; tool_call?: { name?: string | null } | null } | null> | null;
}

export interface ConnectorActivityDeps {
  /** Newest first, and only the given user's messages: this is the one guard against mixing users. */
  findToolCallMessages: (userId: string, limit: number) => Promise<ToolCallMessage[]>;
  findConversationTitles: (
    userId: string,
    conversationIds: string[],
  ) => Promise<Array<{ conversationId?: string | null; title?: string | null }>>;
}

/**
 * One row per connector tool per message, newest first. Calls to the same tool in one turn
 * collapse into a count; non-MCP tools (skills, code, web search) are left out.
 */
export function extractConnectorCalls(
  messages: ToolCallMessage[],
  limit: number,
): Omit<ConnectorActivityItem, 'conversationTitle'>[] {
  const items: Omit<ConnectorActivityItem, 'conversationTitle'>[] = [];
  for (const message of messages) {
    if (!message.conversationId || !message.createdAt) {
      continue;
    }
    const counts = new Map<string, number>();
    for (const part of message.content ?? []) {
      const name = part?.tool_call?.name;
      if (part?.type !== ContentTypes.TOOL_CALL || !name?.includes(Constants.mcp_delimiter)) {
        continue;
      }
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const createdAt = new Date(message.createdAt).toISOString();
    for (const [toolKey, count] of counts) {
      items.push({ toolKey, count, conversationId: message.conversationId, createdAt });
      if (items.length >= limit) {
        return items;
      }
    }
  }
  return items;
}

function parseLimit(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(value, MAX_LIMIT);
}

interface ActivityRequest extends Request {
  user?: { id?: string };
}

/** The signed-in user's recent connector tool calls, read from their own saved messages. */
export function createConnectorActivityHandler(
  deps: ConnectorActivityDeps,
): (req: ActivityRequest, res: Response) => Promise<Response> {
  return async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
      const limit = parseLimit(req.query?.limit);
      const messages = await deps.findToolCallMessages(userId, MESSAGES_SCANNED);
      const calls = extractConnectorCalls(messages, limit);
      const ids = [...new Set(calls.map((call) => call.conversationId))];
      const titles = new Map<string, string>();
      if (ids.length > 0) {
        for (const convo of await deps.findConversationTitles(userId, ids)) {
          if (convo.conversationId && convo.title) {
            titles.set(convo.conversationId, convo.title);
          }
        }
      }
      const items: ConnectorActivityItem[] = calls.map((call) => ({
        ...call,
        conversationTitle: titles.get(call.conversationId) ?? null,
      }));
      return res.json(items);
    } catch (error) {
      logger.error('[connectors] Failed to read connector activity', error);
      return res.status(500).json({ message: 'Failed to read connector activity' });
    }
  };
}
