import { TaskTools } from 'librechat-data-provider';
import type { TaskToolName } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';

export type TaskStage = { id: string; label: TranslationKeys };

/**
 * Plan steps per task tool. Ids must match the `stage` values the server sends in
 * `on_task_progress` (`TASK_STAGES` in `packages/api/src/tasks/tools.ts`); the card
 * moves its current step by matching them.
 */
export const TASK_STAGES: Record<TaskToolName, readonly TaskStage[]> = {
  [TaskTools.extract_table]: [
    { id: 'prepare', label: 'com_ui_task_stage_prepare' },
    { id: 'confirm', label: 'com_ui_task_stage_confirm_fields' },
    { id: 'extract', label: 'com_ui_task_stage_extract_all' },
    { id: 'aggregate', label: 'com_ui_task_stage_aggregate' },
    { id: 'save', label: 'com_ui_task_stage_save' },
  ],
  [TaskTools.summarize_documents]: [
    { id: 'prepare', label: 'com_ui_task_stage_prepare' },
    { id: 'confirm', label: 'com_ui_task_stage_confirm_view' },
    { id: 'summarize', label: 'com_ui_task_stage_summarize' },
    { id: 'merge', label: 'com_ui_task_stage_merge' },
    { id: 'save', label: 'com_ui_task_stage_save' },
  ],
  [TaskTools.write_report]: [
    { id: 'prepare', label: 'com_ui_task_stage_prepare' },
    { id: 'extract', label: 'com_ui_task_stage_extract' },
    { id: 'compose', label: 'com_ui_task_stage_compose' },
    { id: 'render', label: 'com_ui_task_stage_render' },
    { id: 'save', label: 'com_ui_task_stage_save' },
  ],
};

export function isTaskToolName(name: unknown): name is TaskToolName {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(TASK_STAGES, name);
}

/** Tool args arrive as a JSON string while streaming and as an object once saved. */
export function parseTaskArgs(args: unknown): Record<string, unknown> {
  if (args != null && typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  if (typeof args !== 'string' || args.length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(args) as unknown;
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }
    const trimmed = item.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    list.push(trimmed);
  }
  return list;
}
