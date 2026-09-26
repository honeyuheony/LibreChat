import { TASK_PROGRESS_EVENT } from 'librechat-data-provider';
import type { TaskProgressEvent, TaskProgressEventName } from 'librechat-data-provider';

type TaskProgressEnvelope = {
  event: TaskProgressEventName;
  data: TaskProgressEvent;
};

type TaskProgressPublisher = (event: TaskProgressEnvelope) => void | Promise<void>;

export async function emitTaskProgress(
  publish: TaskProgressPublisher,
  progress: TaskProgressEvent,
): Promise<void> {
  await publish({ event: TASK_PROGRESS_EVENT, data: progress });
}
