import type { Request, Response } from 'express';
import type { ConnectorActivityDeps, ToolCallMessage } from './activity';
import { createConnectorActivityHandler, extractConnectorCalls } from './activity';

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

const call = (name: string) => ({ type: 'tool_call', tool_call: { name } });

function mockResponse() {
  const res = {} as Response & { body?: unknown; statusCode?: number };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response['status'];
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res;
  }) as unknown as Response['json'];
  return res;
}

describe('extractConnectorCalls', () => {
  it('keeps connector tools only and counts repeats within one turn', () => {
    const messages: ToolCallMessage[] = [
      {
        conversationId: 'c1',
        createdAt: '2026-09-26T01:00:00.000Z',
        content: [
          call('skill'),
          call('list_directory_mcp_filesystem'),
          call('list_directory_mcp_filesystem'),
          { type: 'text' },
          call('gmail_search_mcp_google-workspace'),
        ],
      },
    ];

    expect(extractConnectorCalls(messages, 10)).toEqual([
      {
        toolKey: 'list_directory_mcp_filesystem',
        count: 2,
        conversationId: 'c1',
        createdAt: '2026-09-26T01:00:00.000Z',
      },
      {
        toolKey: 'gmail_search_mcp_google-workspace',
        count: 1,
        conversationId: 'c1',
        createdAt: '2026-09-26T01:00:00.000Z',
      },
    ]);
  });

  it('stops at the limit', () => {
    const messages: ToolCallMessage[] = [
      { conversationId: 'c1', createdAt: new Date(2), content: [call('a_mcp_x'), call('b_mcp_x')] },
      { conversationId: 'c2', createdAt: new Date(1), content: [call('c_mcp_x')] },
    ];

    expect(extractConnectorCalls(messages, 1).map((item) => item.toolKey)).toEqual(['a_mcp_x']);
  });

  it('skips messages without a conversation', () => {
    expect(
      extractConnectorCalls([{ createdAt: new Date(), content: [call('a_mcp_x')] }], 5),
    ).toEqual([]);
  });
});

describe('createConnectorActivityHandler', () => {
  const deps: jest.Mocked<ConnectorActivityDeps> = {
    findToolCallMessages: jest.fn(),
    findConversationTitles: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a request without a user', async () => {
    const res = mockResponse();
    await createConnectorActivityHandler(deps)({ query: {} } as Request, res);

    expect(res.statusCode).toBe(401);
    expect(deps.findToolCallMessages).not.toHaveBeenCalled();
  });

  it("reads only the signed-in user's messages and conversation titles", async () => {
    deps.findToolCallMessages.mockResolvedValue([
      { conversationId: 'c1', createdAt: new Date(0), content: [call('read_file_mcp_filesystem')] },
    ]);
    deps.findConversationTitles.mockResolvedValue([{ conversationId: 'c1', title: '보고서' }]);
    const res = mockResponse();

    await createConnectorActivityHandler(deps)(
      { user: { id: 'user-a' }, query: {} } as unknown as Request,
      res,
    );

    expect(deps.findToolCallMessages).toHaveBeenCalledWith('user-a', expect.any(Number));
    expect(deps.findConversationTitles).toHaveBeenCalledWith('user-a', ['c1']);
    expect(res.body).toEqual([
      {
        toolKey: 'read_file_mcp_filesystem',
        count: 1,
        conversationId: 'c1',
        conversationTitle: '보고서',
        createdAt: new Date(0).toISOString(),
      },
    ]);
  });

  it('answers 500 when the store fails', async () => {
    deps.findToolCallMessages.mockRejectedValue(new Error('down'));
    const res = mockResponse();

    await createConnectorActivityHandler(deps)(
      { user: { id: 'user-a' }, query: {} } as unknown as Request,
      res,
    );

    expect(res.statusCode).toBe(500);
  });
});
