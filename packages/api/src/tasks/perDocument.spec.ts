import { runPerDocument } from './perDocument';

describe('runPerDocument', () => {
  it('never runs more workers at once than the concurrency limit', async () => {
    let running = 0;
    let peak = 0;
    await runPerDocument(
      Array.from({ length: 10 }, (_, i) => i),
      async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
      },
      { concurrency: 3 },
    );
    expect(peak).toBe(3);
  });

  it('keeps input order and returns a failed item in place without stopping the rest', async () => {
    const outcomes = await runPerDocument([30, 0, 10], async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (delay === 0) {
        throw new Error('bad document');
      }
      return delay * 2;
    });
    expect(outcomes.map((outcome) => (outcome.ok ? outcome.value : outcome.error.message))).toEqual(
      [60, 'bad document', 20],
    );
  });

  it('reports settled counts up to the total', async () => {
    const settled: Array<[number, number]> = [];
    await runPerDocument([1, 2, 3], async (n) => n, {
      onSettled: (done, total) => {
        settled.push([done, total]);
      },
    });
    expect(settled).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });
});
