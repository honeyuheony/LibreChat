import { TASK_PROGRESS_EVENT } from 'librechat-data-provider';
import type { TaskProgressEvent } from 'librechat-data-provider';
import { emitTaskProgress } from './progress';

describe('emitTaskProgress', () => {
  it('publishes the task progress envelope and waits for delivery', async () => {
    const progress: TaskProgressEvent = {
      toolCallId: 'tool-call-1',
      stage: 'extract',
      done: 2,
      total: 5,
      label: '문서 추출',
    };
    const publish = jest.fn().mockResolvedValue(undefined);

    await emitTaskProgress(publish, progress);

    expect(publish).toHaveBeenCalledWith({ event: TASK_PROGRESS_EVENT, data: progress });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed event publication', async () => {
    const progress: TaskProgressEvent = {
      toolCallId: 'tool-call-1',
      stage: 'extract',
      done: 0,
      total: 1,
      label: '문서 추출',
    };
    const publish = jest.fn().mockRejectedValue(new Error('delivery failed'));

    await expect(emitTaskProgress(publish, progress)).rejects.toThrow('delivery failed');
  });
});
