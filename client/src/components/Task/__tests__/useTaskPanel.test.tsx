import { MemoryRouter } from 'react-router-dom';
import { ContentTypes } from 'librechat-data-provider';
import { act, renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import type { TMessage } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { taskPanelState } from '~/store/task';
import useTaskPanel from '../useTaskPanel';

const mockMessagesByConvo: Record<string, TMessage[]> = {};

jest.mock('~/data-provider', () => ({
  /** Undefined until a conversation's messages are loaded, like the query cache. */
  useGetMessagesByConvoId: (id: string) => ({ data: mockMessagesByConvo[id] }),
}));

const taskCall = (id: string) =>
  ({
    messageId: `m-${id}`,
    content: [{ type: ContentTypes.TOOL_CALL, tool_call: { id, name: 'extract_table' } }],
  }) as unknown as TMessage;

const resultMessage = (resultId: string) =>
  ({
    messageId: `m-${resultId}`,
    attachments: [{ type: 'task_result', resultId, kind: 'table', title: resultId }],
  }) as unknown as TMessage;

type Props = { conversationId: string; autoOpen: boolean; isSubmitting: boolean };

function setup(initial: Props, url = '/c/a') {
  const jotai = createStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>
      <JotaiProvider store={jotai}>{children}</JotaiProvider>
    </MemoryRouter>
  );
  const hook = renderHook(
    ({ conversationId, autoOpen, isSubmitting }: Props) =>
      useTaskPanel(conversationId, { autoOpen, isSubmitting }),
    { wrapper, initialProps: initial },
  );
  return { jotai, ...hook };
}

describe('useTaskPanel', () => {
  beforeEach(() => {
    for (const id of Object.keys(mockMessagesByConvo)) delete mockMessagesByConvo[id];
  });

  it('offers nothing for a conversation without task tool calls', () => {
    mockMessagesByConvo.a = [];
    const { result, jotai } = setup({ conversationId: 'a', autoOpen: true, isSubmitting: false });
    expect(result.current).toEqual({ hasTaskCall: false, open: false });
    expect(jotai.get(taskPanelState).open).toBe(false);
  });

  it('opens once a task tool call is in the conversation', () => {
    mockMessagesByConvo.a = [taskCall('t1')];
    const { result } = setup({ conversationId: 'a', autoOpen: true, isSubmitting: false });
    expect(result.current).toEqual({ hasTaskCall: true, open: true });
  });

  it('stays closed on small screens', () => {
    mockMessagesByConvo.a = [taskCall('t1')];
    const { result } = setup({ conversationId: 'a', autoOpen: false, isSubmitting: false });
    expect(result.current).toEqual({ hasTaskCall: true, open: false });
  });

  it('drops an open result when the conversation changes', () => {
    mockMessagesByConvo.a = [taskCall('t1')];
    mockMessagesByConvo.b = [];
    const { jotai, rerender } = setup({ conversationId: 'a', autoOpen: true, isSubmitting: false });
    act(() => jotai.set(taskPanelState, { open: true, view: 'result', resultId: 'r1' }));

    rerender({ conversationId: 'b', autoOpen: true, isSubmitting: false });
    expect(jotai.get(taskPanelState)).toEqual({ open: false, view: 'overview', resultId: null });
  });

  it('clears state left over from before the view mounted', () => {
    mockMessagesByConvo.b = [];
    const jotai = createStore();
    jotai.set(taskPanelState, { open: true, view: 'result', resultId: 'stale' });
    renderHook(() => useTaskPanel('b', { autoOpen: true, isSubmitting: false }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter>
          <JotaiProvider store={jotai}>{children}</JotaiProvider>
        </MemoryRouter>
      ),
    });
    expect(jotai.get(taskPanelState)).toEqual({ open: false, view: 'overview', resultId: null });
  });

  it('keeps the panel when a new chat receives its conversation id', () => {
    mockMessagesByConvo.new = [taskCall('t1')];
    mockMessagesByConvo.c = [taskCall('t1')];
    const { jotai, rerender } = setup({
      conversationId: 'new',
      autoOpen: true,
      isSubmitting: true,
    });
    act(() => jotai.set(taskPanelState, { open: true, view: 'result', resultId: 'r1' }));

    rerender({ conversationId: 'c', autoOpen: true, isSubmitting: true });
    expect(jotai.get(taskPanelState)).toEqual({ open: true, view: 'result', resultId: 'r1' });
  });

  it('opens a result that arrives while the reply streams', () => {
    mockMessagesByConvo.a = [taskCall('t1')];
    const { jotai, rerender } = setup({ conversationId: 'a', autoOpen: true, isSubmitting: true });
    mockMessagesByConvo.a = [taskCall('t1'), resultMessage('r-new')];
    rerender({ conversationId: 'a', autoOpen: true, isSubmitting: true });
    expect(jotai.get(taskPanelState)).toEqual({ open: true, view: 'result', resultId: 'r-new' });
  });

  it('leaves results that were already saved in the overview', () => {
    mockMessagesByConvo.a = [];
    const { jotai, rerender } = setup({ conversationId: 'a', autoOpen: true, isSubmitting: false });
    mockMessagesByConvo.a = [taskCall('t1'), resultMessage('r-old')];
    rerender({ conversationId: 'a', autoOpen: true, isSubmitting: false });
    expect(jotai.get(taskPanelState)).toEqual({ open: true, view: 'overview', resultId: null });
  });

  it('leaves the panel closed on small screens when a result arrives live', () => {
    mockMessagesByConvo.a = [taskCall('t1')];
    const { jotai, rerender } = setup({ conversationId: 'a', autoOpen: false, isSubmitting: true });
    mockMessagesByConvo.a = [taskCall('t1'), resultMessage('r-new')];
    rerender({ conversationId: 'a', autoOpen: false, isSubmitting: true });
    expect(jotai.get(taskPanelState).open).toBe(false);
  });

  it('does not open an old result that loads while a paused reply resumes', () => {
    const { jotai, rerender } = setup({ conversationId: 'a', autoOpen: true, isSubmitting: true });
    mockMessagesByConvo.a = [taskCall('t1'), resultMessage('r-old')];
    rerender({ conversationId: 'a', autoOpen: true, isSubmitting: true });
    expect(jotai.get(taskPanelState).resultId).toBeNull();

    mockMessagesByConvo.a = [taskCall('t1'), resultMessage('r-old'), resultMessage('r-new')];
    rerender({ conversationId: 'a', autoOpen: true, isSubmitting: true });
    expect(jotai.get(taskPanelState).resultId).toBe('r-new');
  });

  describe('result query', () => {
    it('opens the named result once the conversation messages have loaded', () => {
      const { jotai, rerender } = setup(
        { conversationId: 'a', autoOpen: true, isSubmitting: false },
        '/c/a?result=r-old',
      );
      expect(jotai.get(taskPanelState).view).toBe('overview');

      mockMessagesByConvo.a = [taskCall('t1'), resultMessage('r-old'), resultMessage('r-new')];
      rerender({ conversationId: 'a', autoOpen: true, isSubmitting: false });
      expect(jotai.get(taskPanelState)).toEqual({ open: true, view: 'result', resultId: 'r-old' });
    });

    it('opens the named result on small screens too', () => {
      mockMessagesByConvo.a = [taskCall('t1'), resultMessage('r-old')];
      const { jotai } = setup(
        { conversationId: 'a', autoOpen: false, isSubmitting: false },
        '/c/a?result=r-old',
      );
      expect(jotai.get(taskPanelState)).toEqual({ open: true, view: 'result', resultId: 'r-old' });
    });

    it('ignores a result that is not in this conversation', () => {
      mockMessagesByConvo.a = [taskCall('t1'), resultMessage('r-old')];
      const { jotai } = setup(
        { conversationId: 'a', autoOpen: true, isSubmitting: false },
        '/c/a?result=r-other',
      );
      expect(jotai.get(taskPanelState)).toEqual({ open: true, view: 'overview', resultId: null });
    });

    it('does not reopen the result after the user goes back to the overview', () => {
      mockMessagesByConvo.a = [taskCall('t1'), resultMessage('r-old')];
      const { jotai, rerender } = setup(
        { conversationId: 'a', autoOpen: true, isSubmitting: false },
        '/c/a?result=r-old',
      );
      act(() => jotai.set(taskPanelState, { open: true, view: 'overview', resultId: null }));

      mockMessagesByConvo.a = [taskCall('t1'), resultMessage('r-old'), resultMessage('r-2')];
      rerender({ conversationId: 'a', autoOpen: true, isSubmitting: false });
      expect(jotai.get(taskPanelState)).toEqual({ open: true, view: 'overview', resultId: null });
    });
  });
});
