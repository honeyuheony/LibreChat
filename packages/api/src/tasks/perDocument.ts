/** 추정값: 설계 문서의 제안값이며 모델 한도·처리 시간은 측정하지 않았다. */
export const DEFAULT_TASK_CONCURRENCY = 4;

export type PerDocumentOutcome<T> = { ok: true; value: T } | { ok: false; error: Error };

export interface RunPerDocumentOptions {
  concurrency?: number;
  signal?: AbortSignal;
  /** Called after each item settles with the number settled so far. */
  onSettled?: (done: number, total: number) => void | Promise<void>;
}

/**
 * Runs `worker` over every item with bounded concurrency and keeps input order.
 * One item failing never stops the rest; its error is returned in place.
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
