import { act, renderHook } from '@testing-library/react';
import type { TSkillDraft, TSkillDraftRequest } from 'librechat-data-provider';
import useDraft, { DRAFT_DEBOUNCE_MS, DRAFT_RATE_LIMIT_PAUSE_MS } from '../useDraft';

const draft = { title: '출장보고 작성' } as TSkillDraft;
const isRateLimited = (error: unknown) => (error as { status?: number }).status === 429;

function setup(requestDraft: jest.Mock<Promise<TSkillDraft>, [TSkillDraftRequest]>) {
  const onDraft = jest.fn();
  const hook = renderHook(
    ({ text }: { text: string }) =>
      useDraft({ text, direct: false, requestDraft, onDraft, isRateLimited }),
    { initialProps: { text: '' } },
  );
  const type = async (text: string, waitMs = 200) => {
    hook.rerender({ text });
    await act(async () => {
      jest.advanceTimersByTime(waitMs);
    });
  };
  return { onDraft, type };
}

describe('useDraft', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('asks for one draft after typing stops for the debounce window', async () => {
    const requestDraft = jest.fn().mockResolvedValue(draft);
    const { onDraft, type } = setup(requestDraft);

    await type('출');
    await type('출장');
    await type('출장 메모를 보고서로 만든다.', DRAFT_DEBOUNCE_MS - 1);
    expect(requestDraft).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(requestDraft).toHaveBeenCalledTimes(1);
    expect(requestDraft).toHaveBeenCalledWith({
      text: '출장 메모를 보고서로 만든다.',
      direct: false,
    });
    expect(onDraft).toHaveBeenCalledWith(draft);
  });

  it('does not ask again when only the sentences after the first change', async () => {
    const requestDraft = jest.fn().mockResolvedValue(draft);
    const { type } = setup(requestDraft);

    await type('출장 메모를 보고서로 만든다.', DRAFT_DEBOUNCE_MS);
    await type('출장 메모를 보고서로 만든다.\n환율은 출장일 기준으로 적는다.', DRAFT_DEBOUNCE_MS);
    expect(requestDraft).toHaveBeenCalledTimes(1);

    await type('회의록을 정리한다.\n환율은 출장일 기준으로 적는다.', DRAFT_DEBOUNCE_MS);
    expect(requestDraft).toHaveBeenCalledTimes(2);
  });

  it('stops asking for a while after the server answers 429', async () => {
    const requestDraft = jest.fn().mockRejectedValueOnce({ status: 429 }).mockResolvedValue(draft);
    const { onDraft, type } = setup(requestDraft);

    await type('출장 메모를 보고서로 만든다.', DRAFT_DEBOUNCE_MS);
    expect(requestDraft).toHaveBeenCalledTimes(1);

    await type('회의록을 정리한다.', DRAFT_DEBOUNCE_MS);
    await type('주간보고를 쓴다.', DRAFT_DEBOUNCE_MS);
    expect(requestDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(DRAFT_RATE_LIMIT_PAUSE_MS);
    });
    await type('주간보고를 표로 쓴다.', DRAFT_DEBOUNCE_MS);
    expect(requestDraft).toHaveBeenCalledTimes(2);
    expect(onDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps asking after an ordinary failure', async () => {
    const requestDraft = jest.fn().mockRejectedValueOnce({ status: 500 }).mockResolvedValue(draft);
    const { type } = setup(requestDraft);

    await type('출장 메모를 보고서로 만든다.', DRAFT_DEBOUNCE_MS);
    await type('회의록을 정리한다.', DRAFT_DEBOUNCE_MS);
    expect(requestDraft).toHaveBeenCalledTimes(2);
  });
});
