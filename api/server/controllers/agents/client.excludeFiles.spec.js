const AgentClient = require('./client');

describe('AgentClient save options with the uploaded files switched off', () => {
  const buildClient = (agent) => {
    const client = Object.create(AgentClient.prototype);
    client.options = {
      req: { body: { conversationId: 'conversation-1' }, config: {}, resolvedConversation: null },
      endpoint: 'agents',
      resendFiles: false,
      agent: { id: 'agent_1', provider: 'openai', ...agent },
    };
    return client;
  };

  it('saves the configured resendFiles rather than the per-request override', () => {
    const client = buildClient({ excludeConversationFiles: true, persistedResendFiles: true });
    expect(client.getSaveOptions().resendFiles).toBe(true);
  });

  it('saves resendFiles as run when no configured value is carried', () => {
    const client = buildClient({});
    expect(client.getSaveOptions().resendFiles).toBe(false);
  });
});
