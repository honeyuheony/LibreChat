import type { TaskCell } from 'librechat-data-provider';
import type { CachedSummary, TaskCache } from '../cache';
import type { TaskLLM } from '../llm';
import { prepareDocument, type TaskDocument } from '../documents';

export function makeDoc(file_id: string, text: string, filename = `${file_id}.txt`): TaskDocument {
  return prepareDocument({ file_id, filename, text });
}

/** Answers each prompt with `reply(prompt)` and records every prompt it received. */
export function fakeLLM(reply: (prompt: string) => unknown, model = 'fake-model') {
  const prompts: string[] = [];
  const llm: TaskLLM = {
    model,
    async invoke(prompt) {
      prompts.push(prompt);
      const answer = reply(prompt);
      return typeof answer === 'string' ? answer : JSON.stringify(answer);
    },
  };
  return { llm, prompts };
}

export function memoryCache(): TaskCache & {
  cells: Map<string, TaskCell>;
  summaries: Map<string, CachedSummary>;
} {
  const cells = new Map<string, TaskCell>();
  const summaries = new Map<string, CachedSummary>();
  const docKey = (key: {
    fileId: string;
    textHash: string;
    promptVersion: string;
    model: string;
  }) => [key.fileId, key.textHash, key.promptVersion, key.model].join('|');
  return {
    cells,
    summaries,
    async getCells({ fields, ...key }) {
      const found = new Map<string, TaskCell>();
      for (const field of fields) {
        const cell = cells.get(`${docKey(key)}|${field}`);
        if (cell) {
          found.set(field, cell);
        }
      }
      return found;
    },
    async saveCells({ cells: fresh, ...key }) {
      fresh.forEach((cell, field) => cells.set(`${docKey(key)}|${field}`, cell));
    },
    async getSummary({ view, ...key }) {
      return summaries.get(`${docKey(key)}|${view}`) ?? null;
    },
    async saveSummary({ view, summary, ...key }) {
      summaries.set(`${docKey(key)}|${view}`, summary);
    },
  };
}

/** Pulls `Document name: …` out of a per-document prompt. */
export function documentName(prompt: string): string {
  return /Document name: (.*)/.exec(prompt)?.[1] ?? '';
}
