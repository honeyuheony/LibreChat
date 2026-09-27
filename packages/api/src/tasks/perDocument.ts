/** 모델 한도와 처리 시간을 측정하지 않고 어림한 동시 처리 수다. */
export const DEFAULT_TASK_CONCURRENCY = 4;

export type PerDocumentOutcome<T> = { ok: true; value: T } | { ok: false; error: Error };

export interface RunPerDocumentOptions {
  concurrency?: number;
  signal?: AbortSignal;
  /** 항목 하나가 끝날 때마다 지금까지 끝난 수를 넘겨 부른다. */
  onSettled?: (done: number, total: number) => void | Promise<void>;
}

/**
 * 동시 실행 수를 제한해 모든 항목에 `worker` 를 돌리고 입력 순서를 지킨다.
 * 한 항목이 실패해도 나머지는 멈추지 않고, 그 자리에 오류를 돌려준다.
 */
export async function runPerDocument<I, T>(
  items: readonly I[],
  worker: (item: I, index: number) => Promise<T>,
  options: RunPerDocumentOptions = {},
): Promise<PerDocumentOutcome<T>[]> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_TASK_CONCURRENCY);
  const outcomes: PerDocumentOutcome<T>[] = new Array(items.length);
  let next = 0;
  let done = 0;

  const runLane = async () => {
    while (next < items.length) {
      const index = next++;
      if (options.signal?.aborted) {
        outcomes[index] = { ok: false, error: new Error('Task aborted') };
      } else {
        try {
          outcomes[index] = { ok: true, value: await worker(items[index], index) };
        } catch (error) {
          outcomes[index] = {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      }
      done++;
      await options.onSettled?.(done, items.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runLane));
  return outcomes;
}
