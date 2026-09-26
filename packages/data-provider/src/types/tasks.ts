import type { TaskTools } from './tools';

export type ExtractTableArguments = {
  fields: string[];
  suggested_fields?: string[];
  file_ids?: string[];
};

export type SummarizeDocumentsArguments = {
  views: string[];
  view?: string;
  file_ids?: string[];
};

export type WriteReportArguments = {
  template_id: string;
  fields?: string[];
  file_ids?: string[];
};

export type TaskToolArguments = {
  [TaskTools.extract_table]: ExtractTableArguments;
  [TaskTools.summarize_documents]: SummarizeDocumentsArguments;
  [TaskTools.write_report]: WriteReportArguments;
};

export type TaskToolName = keyof TaskToolArguments;

export type TaskEvidence = { quote: string; page?: number; paragraph?: number };

export type TaskCell = {
  value: string | null;
  status: 'ok' | 'none' | 'low';
  evidence?: TaskEvidence;
};

export type TaskStats = {
  docs: number;
  reflected: number;
  none: number;
  low: number;
  textOnly: number;
  cached: number;
  seconds: number;
};

export type TaskTableResult = {
  kind: 'table';
  resultId: string;
  conversationId: string;
  title: string;
  fields: string[];
  rows: {
    file_id: string;
    filename: string;
    parse: 'ok' | 'text_only';
    cells: TaskCell[];
  }[];
  stats: TaskStats;
  extractor: { promptVersion: string; model: string };
  createdAt: string;
};

export type TaskDocResult = {
  kind: 'summary' | 'report';
  resultId: string;
  conversationId: string;
  title: string;
  view?: string;
  templateId?: string;
  body: string;
  footnotes: { n: number; file_id: string; filename: string; evidence: TaskEvidence }[];
  perDoc?: { file_id: string; filename: string; line: string }[];
  file?: { file_id: string; filename: string };
  stats: TaskStats;
  createdAt: string;
};

export type TaskResult = TaskTableResult | TaskDocResult;

export type TaskProgressEvent = {
  toolCallId: string;
  stage: string;
  done: number;
  total: number;
  label: string;
};

export const TASK_PROGRESS_EVENT = 'on_task_progress' as const;
export type TaskProgressEventName = typeof TASK_PROGRESS_EVENT;
