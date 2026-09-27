import type { Response } from 'express';
import type { SkillDraftDeps } from './draft';
import type { ServerRequest } from '~/types';
import type { TaskLLM } from '~/tasks/llm';
import { createSkillDraftHandler, resolveDefaultAgentId, sanitizeSkillSlug } from './draft';

jest.mock('~/middleware/tenant', () => ({ resolveRequestTenantId: () => undefined }));

const USER_ID = 'user-1';

function createResponse() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function createLLM(reply: string | Error): TaskLLM & { invoke: jest.Mock } {
  return {
    model: 'test-model',
    invoke: jest.fn(async () => {
      if (reply instanceof Error) {
        throw reply;
      }
      return reply;
    }),
  };
}

function createDeps(overrides: Partial<SkillDraftDeps> = {}): SkillDraftDeps & {
  getConvo: jest.Mock;
  getMessages: jest.Mock;
  getAuthorSkillByName: jest.Mock;
} {
  return {
    getDraftLLM: jest.fn(async () => null),
    getConvo: jest.fn(async () => null),
    getMessages: jest.fn(async () => []),
    getAuthorSkillByName: jest.fn(async () => null),
    ...overrides,
  } as SkillDraftDeps & {
    getConvo: jest.Mock;
    getMessages: jest.Mock;
    getAuthorSkillByName: jest.Mock;
  };
}

function createRequest(body: unknown, config: Record<string, unknown> = {}): ServerRequest {
  return {
    user: { id: USER_ID, _id: USER_ID, role: 'USER' },
    body,
    config,
  } as unknown as ServerRequest;
}

async function runDraft(deps: SkillDraftDeps, body: unknown, config?: Record<string, unknown>) {
  const res = createResponse();
  await createSkillDraftHandler(deps)(createRequest(body, config), res as unknown as Response);
  return res;
}

const VALID_MODEL_REPLY = JSON.stringify({
  slug: 'weekly-meeting-report',
  title: '주간 회의 보고서',
  description: '주간 회의록을 읽고 결정 사항과 할 일을 보고서로 정리한다.',
  triggers: ['주간 회의', '회의록'],
  output: 'report',
  extras: ['polish', 'unknown-extra'],
  fields: ['결정 사항', '담당자'],
  icon: '📊',
  steps: ['회의록에서 결정 사항을 뽑는다.', '담당자별 할 일을 표로 만든다.'],
  connectors: ['hwp', 'not-configured'],
  fileKinds: [{ name: '회의록 양식.hwp', kind: 'assets' }],
});

describe('resolveDefaultAgentId', () => {
  it('prefers the spec marked default', () => {
    expect(
      resolveDefaultAgentId({
        list: [
          { name: 'a', preset: { endpoint: 'agents', agent_id: 'agent_first' } },
          { name: 'b', default: true, preset: { endpoint: 'agents', agent_id: 'agent_default' } },
        ],
      } as never),
    ).toBe('agent_default');
  });

  it('falls back to the first spec that names an agent', () => {
    expect(
      resolveDefaultAgentId({
        list: [
          { name: 'a', preset: { endpoint: 'openAI', model: 'gpt' } },
          { name: 'b', preset: { endpoint: 'agents', agent_id: 'agent_b' } },
        ],
      } as never),
    ).toBe('agent_b');
  });

  it('returns null without model specs', () => {
    expect(resolveDefaultAgentId(undefined)).toBeNull();
  });
});

describe('sanitizeSkillSlug', () => {
  it('lowercases and replaces characters outside the name pattern', () => {
    expect(sanitizeSkillSlug('Weekly Report_v2!')).toBe('weekly-report-v2');
  });

  it('rejects values with nothing usable left', () => {
    expect(sanitizeSkillSlug('주간 보고')).toBeNull();
    expect(sanitizeSkillSlug(42)).toBeNull();
  });
});

describe('createSkillDraftHandler', () => {
  it('rejects unauthenticated requests', async () => {
    const res = createResponse();
    await createSkillDraftHandler(createDeps())(
      { body: { text: 'x' } } as unknown as ServerRequest,
      res as unknown as Response,
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it.each([
    ['missing text', {}],
    ['blank text', { text: '   ' }],
    ['non-string text', { text: 42 }],
    ['oversized text', { text: 'a'.repeat(20001) }],
    ['non-boolean direct', { text: '회의록 요약', direct: 'yes' }],
    ['non-array files', { text: '회의록 요약', files: 'a.hwp' }],
    ['file without a name', { text: '회의록 요약', files: [{}] }],
    ['non-string conversation id', { text: '회의록 요약', context: { conversationId: 7 } }],
  ])('rejects %s with 400', async (_label, body) => {
    const deps = createDeps();
    const res = await runDraft(deps, body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(deps.getDraftLLM).not.toHaveBeenCalled();
  });

  it('does not read a conversation that belongs to someone else', async () => {
    const llm = createLLM(VALID_MODEL_REPLY);
    const deps = createDeps({ getDraftLLM: jest.fn(async () => llm) });
    const res = await runDraft(deps, {
      text: '주간 회의록을 보고서로 만들어줘.',
      context: { conversationId: 'someone-elses' },
    });
    expect(deps.getConvo).toHaveBeenCalledWith(USER_ID, 'someone-elses');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(deps.getMessages).not.toHaveBeenCalled();
    expect(llm.invoke).not.toHaveBeenCalled();
  });

  it('accepts a well-formed model reply and drops values outside the allowed sets', async () => {
    const llm = createLLM(`여기 초안입니다.\n\`\`\`json\n${VALID_MODEL_REPLY}\n\`\`\``);
    const deps = createDeps({ getDraftLLM: jest.fn(async () => llm) });
    const res = await runDraft(
      deps,
      {
        text: '주간 회의록을 보고서로 만들어줘. 담당자를 꼭 적어줘.',
        files: [{ name: '회의록 양식.hwp' }, { name: '지난주 예시.pdf' }],
      },
      { mcpConfig: { hwp: {}, search: {} } },
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      slug: 'weekly-meeting-report',
      title: '주간 회의 보고서',
      description: '주간 회의록을 읽고 결정 사항과 할 일을 보고서로 정리한다.',
      triggers: ['주간 회의', '회의록'],
      output: 'report',
      extras: ['polish'],
      fields: ['결정 사항', '담당자'],
      icon: '📊',
      steps: ['회의록에서 결정 사항을 뽑는다.', '담당자별 할 일을 표로 만든다.'],
      connectors: ['hwp'],
      fileKinds: [
        { name: '회의록 양식.hwp', kind: 'assets' },
        { name: '지난주 예시.pdf', kind: 'examples' },
      ],
      origin: 'model',
    });
    const prompt = llm.invoke.mock.calls[0][0] as string;
    expect(prompt).toContain('주간 회의록을 보고서로 만들어줘.');
    expect(prompt).toContain('회의록 양식.hwp');
  });

  it('falls back to rule-based values when the model reply is not JSON', async () => {
    const llm = createLLM('초안을 만들 수 없습니다.');
    const deps = createDeps({ getDraftLLM: jest.fn(async () => llm) });
    const res = await runDraft(deps, {
      text: '주간 회의록을 보고서로 만들어줘. 결정 사항을 먼저 적는다.',
    });

    expect(res.status).toHaveBeenCalledWith(200);
    const draft = res.json.mock.calls[0][0];
    expect(draft.origin).toBe('rules');
    expect(draft.output).toBe('report');
    expect(draft.slug).toBe('meeting-report');
    expect(draft.steps).toEqual(['결정 사항을 먼저 적는다.']);
    expect(draft.connectors).toEqual([]);
  });

  it('falls back field by field when the model returns wrong types', async () => {
    const llm = createLLM(
      JSON.stringify({
        slug: '회의 보고서',
        title: 12,
        description: '',
        triggers: 'meeting',
        output: 'essay',
        extras: null,
        fields: [1, 2],
        icon: 'not an emoji',
        steps: ['첫 단계'],
        connectors: 'hwp',
      }),
    );
    const deps = createDeps({ getDraftLLM: jest.fn(async () => llm) });
    const res = await runDraft(deps, { text: '회의록을 요약해줘.' });

    const draft = res.json.mock.calls[0][0];
    expect(draft.origin).toBe('model');
    expect(draft.slug).toBe('meeting-summary');
    expect(draft.output).toBe('summary');
    expect(typeof draft.title).toBe('string');
    expect(draft.title.length).toBeGreaterThan(0);
    expect(draft.description.length).toBeGreaterThan(0);
    expect(Array.isArray(draft.triggers)).toBe(true);
    expect(draft.extras).toEqual([]);
    expect(draft.fields).toEqual([]);
    expect(draft.icon).not.toBe('not an emoji');
    expect(draft.steps).toEqual(['첫 단계']);
    expect(draft.connectors).toEqual([]);
  });

  it('falls back to rules when the model call fails', async () => {
    const llm = createLLM(new Error('provider down'));
    const deps = createDeps({ getDraftLLM: jest.fn(async () => llm) });
    const res = await runDraft(deps, { text: 'Translate the press release into English.' });

    expect(res.status).toHaveBeenCalledWith(200);
    const draft = res.json.mock.calls[0][0];
    expect(draft.origin).toBe('rules');
    expect(draft.extras).toContain('translate');
  });

  it('falls back to rules when no default agent model is available', async () => {
    const deps = createDeps();
    const res = await runDraft(deps, { text: '민원 답변 초안을 써줘.' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].origin).toBe('rules');
  });

  it('adds -2 and onward to a slug the user already owns', async () => {
    const llm = createLLM(VALID_MODEL_REPLY);
    const deps = createDeps({
      getDraftLLM: jest.fn(async () => llm),
      getAuthorSkillByName: jest.fn(async ({ name }: { name: string }) =>
        name === 'weekly-meeting-report' || name === 'weekly-meeting-report-2' ? { name } : null,
      ),
    });
    const res = await runDraft(deps, { text: '주간 회의록을 보고서로 만들어줘.' });
    expect(res.json.mock.calls[0][0].slug).toBe('weekly-meeting-report-3');
    expect(deps.getAuthorSkillByName).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'weekly-meeting-report', author: USER_ID }),
    );
  });

  it('gives the model the recent turns and tool names of an owned conversation', async () => {
    const llm = createLLM(VALID_MODEL_REPLY);
    const deps = createDeps({
      getDraftLLM: jest.fn(async () => llm),
      getConvo: jest.fn(async () => ({ conversationId: 'convo-1' })),
      getMessages: jest.fn(async () => [
        { isCreatedByUser: true, text: '이번 주 회의록 세 건을 보고서로 묶어줘.' },
        {
          isCreatedByUser: false,
          text: '',
          content: [
            { type: 'tool_call', tool_call: { name: 'hwp_read' } },
            { type: 'text', text: '보고서를 만들었습니다.' },
          ],
        },
      ]),
    });
    const res = await runDraft(deps, {
      text: '회의록 보고서',
      context: { conversationId: 'convo-1' },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(deps.getMessages).toHaveBeenCalledWith(
      { conversationId: 'convo-1', user: USER_ID },
      expect.any(String),
    );
    const prompt = llm.invoke.mock.calls[0][0] as string;
    expect(prompt).toContain('이번 주 회의록 세 건을 보고서로 묶어줘.');
    expect(prompt).toContain('hwp_read');
  });
});
