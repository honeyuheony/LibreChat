import { createToolPolicyHook } from '@librechat/agents';
import { toolApprovalPolicySchema } from 'librechat-data-provider';
import { TASK_TOOL_APPROVAL_POLICY } from '~/tasks/tools';
import { mapToolApprovalPolicy } from './policy';
import { buildHITLRunWiring } from './runtime';

async function decide(toolName: string) {
  const hook = createToolPolicyHook(mapToolApprovalPolicy(TASK_TOOL_APPROVAL_POLICY) ?? {});
  const output = await hook(
    { toolName } as Parameters<typeof hook>[0],
    new AbortController().signal,
  );
  return (output as { decision?: string }).decision;
}

describe('task tools approval policy', () => {
  it('is a valid endpoints.agents.toolApproval value that turns HITL on', () => {
    expect(toolApprovalPolicySchema.parse(TASK_TOOL_APPROVAL_POLICY)).toEqual(
      TASK_TOOL_APPROVAL_POLICY,
    );
    expect(buildHITLRunWiring(TASK_TOOL_APPROVAL_POLICY)).toBeDefined();
  });

  it.each(['extract_table', 'summarize_documents'])('pauses %s for the card', async (name) => {
    await expect(decide(name)).resolves.toBe('ask');
  });

  it.each([
    'write_report',
    'file_search',
    'read_hangul_text_mcp_hangul-docs',
    'drive_search_mcp_google-workspace',
    'ask_user_question',
  ])('runs %s without approval', async (name) => {
    await expect(decide(name)).resolves.toBe('allow');
  });
});
