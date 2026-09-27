import { logger } from '@librechat/data-schemas';
import { Constants, ContentTypes } from 'librechat-data-provider';
import type { ConnectorActivityItem } from 'librechat-data-provider';
import type { Request, Response } from 'express';

/** 한 턴에 호출이 여러 번 들어 있는 경우가 많아, 이 정도 최근 턴이면 한 쪽 분량의 행을 채운다. */
const MESSAGES_SCANNED = 40;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

export interface ToolCallMessage {
  conversationId?: string | null;
  createdAt?: Date | string | null;
  content?: Array<{ type?: string; tool_call?: { name?: string | null } | null } | null> | null;
}

export interface ConnectorActivityDeps {
  /** 최신순으로, 주어진 사용자의 메시지만 돌려준다. 다른 사용자의 기록이 섞이지 않게 막는 곳은 여기 하나뿐이다. */
  findToolCallMessages: (userId: string, limit: number) => Promise<ToolCallMessage[]>;
  findConversationTitles: (
    userId: string,
    conversationIds: string[],
  ) => Promise<Array<{ conversationId?: string | null; title?: string | null }>>;
}

/**
 * 메시지마다 커넥터 도구 하나에 한 행을 최신순으로 만든다. 한 턴 안에서 같은 도구를 여러 번 부르면
 * 횟수로 합치고, MCP 가 아닌 도구(스킬, 코드, 웹 검색)는 뺀다.
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

/** 로그인한 사용자 본인이 저장한 메시지에서 최근 커넥터 도구 호출을 읽는다. */
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
