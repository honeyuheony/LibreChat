import { TaskTools } from 'librechat-data-provider';
import type { TaskToolName } from 'librechat-data-provider';
import type { ExtendedJsonSchema } from '~/tools/registry/schema';

type StaticTaskToolName = Exclude<TaskToolName, TaskTools.fill_report_template>;

export const TASK_TOOL_NAMES: readonly StaticTaskToolName[] = [
  TaskTools.extract_table,
  TaskTools.summarize_documents,
  TaskTools.write_report,
];

export function isTaskToolName(name: unknown): name is StaticTaskToolName {
  return typeof name === 'string' && (TASK_TOOL_NAMES as readonly string[]).includes(name);
}

/** 권장하는 `endpoints.agents.toolApproval` 설정이다. 카드를 띄우는 두 tool 만 멈춰 승인을 받는다. */
export const TASK_TOOL_APPROVAL_POLICY: { enabled: boolean; allow: string[]; ask: string[] } = {
  enabled: true,
  allow: ['*'],
  ask: [TaskTools.extract_table, TaskTools.summarize_documents],
};

const fileIdsProperty = {
  type: 'array',
  items: { type: 'string' },
  description:
    'Leave empty to use every file uploaded to this conversation. Only list ids when the user picked specific files.',
} as const;

export const extractTableSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Column names to extract from every document, in the user language.',
    },
    suggested_fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional extra columns the user may turn on; shown switched off.',
    },
    file_ids: fileIdsProperty,
  },
  required: ['fields'],
};

export const summarizeDocumentsSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    views: {
      type: 'array',
      items: { type: 'string' },
      description: 'Candidate viewpoints the user chooses from.',
    },
    view: {
      type: 'string',
      description: 'The chosen viewpoint. Only set it when the user named one.',
    },
    file_ids: fileIdsProperty,
  },
  required: ['views'],
};

export const writeReportSchema: ExtendedJsonSchema = {
  type: 'object',
  properties: {
    template_id: {
      type: 'string',
      description:
        'Report template id, e.g. "hwp-report", "weekly-report" or "nk-weekly-briefing", as named by the skill.',
    },
    fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Leave empty to extract the fields the template defines.',
    },
    file_ids: fileIdsProperty,
  },
  required: ['template_id'],
};

export const TASK_TOOL_DEFINITIONS: Record<
  StaticTaskToolName,
  { name: StaticTaskToolName; description: string; schema: ExtendedJsonSchema }
> = {
  [TaskTools.extract_table]: {
    name: TaskTools.extract_table,
    description:
      'Reads EVERY document uploaded to the conversation and extracts the same fields from each into a comparison table. Counts are computed by code. Use for tables, lists, "how many", or "all documents" requests; use file_search for a single fact. The user confirms the fields before it runs.',
    schema: extractTableSchema,
  },
  [TaskTools.summarize_documents]: {
    name: TaskTools.summarize_documents,
    description:
      'Summarizes EVERY document uploaded to the conversation one by one from a chosen viewpoint, then merges them into one summary with a one-line entry per document. The user picks the viewpoint before it runs.',
    schema: summarizeDocumentsSchema,
  },
  [TaskTools.write_report]: {
    name: TaskTools.write_report,
    description:
      'Extracts the report template fields from EVERY document uploaded to the conversation, writes the prose sections, and fills the HWP report template (.hwpx) with footnotes. Use when the user asks for a report or an HWP draft.',
    schema: writeReportSchema,
  },
};
