import { Constants } from 'librechat-data-provider';
import type { TModelSpec } from 'librechat-data-provider';
import type { TrialTransport } from '../trial';
import { TrialError, buildTrialPayload, pickTrialSpec, runTrial } from '../trial';

const spec = {
  name: 'work-helper',
  label: '업무 도우미',
  default: true,
  preset: { endpoint: 'agents', agent_id: 'agent_default' },
} as TModelSpec;

type Emit = { message: (data: unknown) => void; error: (error: unknown) => void };

function fakeTransport(start: () => Promise<unknown>) {
  const emit: Partial<Emit> = {};
  const close = jest.fn();
  const transport: TrialTransport = {
    start: jest.fn(start),
    subscribe: jest.fn((_streamId, onMessage, onError) => {
      emit.message = onMessage;
      emit.error = onError;
      return close;
    }),
  };
  return { transport, emit: emit as Emit, close };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('trial conversation', () => {
  it('uses the default model spec, falling back to the first one', () => {
    const other = { ...spec, name: 'other', default: false } as TModelSpec;
    expect(pickTrialSpec([other, spec])).toBe(spec);
    expect(pickTrialSpec([other])).toBe(other);
    expect(pickTrialSpec(undefined)).toBeNull();
  });

  it('starts a temporary conversation that picks the skill by hand', () => {
    const { url, payload } = buildTrialPayload({
      skillName: 'trip-report',
      prompt: '출장 시작해줘',
      spec,
    });
    expect(url).toMatch(/\/api\/agents\/chat\/agents$/);
    expect(payload).toMatchObject({
      agent_id: 'agent_default',
      spec: 'work-helper',
      text: '출장 시작해줘',
      isTemporary: true,
      manualSkills: ['trip-report'],
      parentMessageId: Constants.NO_PARENT,
      conversationId: null,
    });
  });

  it('collects the streamed reply and resolves with the conversation id on the final event', async () => {
    const { transport, emit, close } = fakeTransport(async () => ({
      streamId: 'stream-1',
      conversationId: 'convo-1',
    }));
    const onReply = jest.fn();
    const running = runTrial(transport, {
      skillName: 'trip-report',
      prompt: '시작',
      spec,
      onReply,
    });
    await flush();

    emit.message({
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: '보고' }] } },
    });
    emit.message({
      event: 'on_message_delta',
      data: { delta: { content: [{ type: 'text', text: '서' }] } },
    });
    emit.message({ final: true, conversation: { conversationId: 'convo-1' }, responseMessage: {} });

    await expect(running).resolves.toEqual({ conversationId: 'convo-1', reply: '보고서' });
    expect(onReply).toHaveBeenLastCalledWith('보고서');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('fails when the response carries an error', async () => {
    const { transport, emit } = fakeTransport(async () => ({ streamId: 's', conversationId: 'c' }));
    const running = runTrial(transport, { skillName: 'x', prompt: '시작', spec });
    await flush();
    emit.message({ final: true, responseMessage: { error: true } });
    await expect(running).rejects.toEqual(new TrialError('response'));
  });

  it('fails when the stream breaks', async () => {
    const { transport, emit } = fakeTransport(async () => ({ streamId: 's', conversationId: 'c' }));
    const running = runTrial(transport, { skillName: 'x', prompt: '시작', spec });
    await flush();
    emit.error(new Error('closed'));
    await expect(running).rejects.toEqual(new TrialError('stream'));
  });

  it('fails when the server does not start a stream', async () => {
    const { transport } = fakeTransport(async () => ({ status: 'settled' }));
    await expect(runTrial(transport, { skillName: 'x', prompt: '시작', spec })).rejects.toEqual(
      new TrialError('start'),
    );
  });
});
