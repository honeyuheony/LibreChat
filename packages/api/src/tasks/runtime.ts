import { logger } from '@librechat/data-schemas';
import type { TaskProgressEvent, TaskResult } from 'librechat-data-provider';
import type { Readable } from 'stream';
import type { Model } from 'mongoose';
import type { EndpointDbMethods, ServerRequest } from '~/types';
import type { TaskAgentModel, TaskLLM } from './llm';
import type { TaskDocument } from './documents';
import type { TaskToolDeps } from './tools';
import { getDeploymentSkillRegistry } from '~/skills/deployment';
import { createHwpService } from './hwpService';
import { createMongoTaskCache } from './cache';
import { prepareDocument } from './documents';
import { loadReportTemplate } from './report';
import { createTaskLLM } from './llm';

export interface StoredFile {
  file_id: string;
  filename: string;
  type?: string;
  text?: string | null;
  filepath?: string;
  source?: string;
}

/** Files with no text to read (images, audio, video) are not task documents. */
const NON_DOCUMENT_TYPE = /^(image|audio|video)\//;
const HWPX_MIME_TYPE = 'application/hwp+zip';

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Per-page text; stored File `text` joins pages with one newline, so page numbers are lost there. */
export async function extractPdfPages(data: Buffer): Promise<string[]> {
  // Imported inline so that Jest can load this module without the ESM-only pdfjs build
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(data) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim(),
    );
  }
  return pages;
}

/**
 * The conversation's files, oldest message first, restricted to files the user owns.
 * `fileIds` from the model can only narrow this set, never add to it.
 */
export async function loadConversationDocuments({
  userId,
  conversationId,
  fileIds,
  requestFileIds = [],
  getMessages,
  getFiles,
  readPdf,
}: {
  userId: string;
  conversationId: string;
  fileIds?: string[];
  requestFileIds?: string[];
  getMessages: (
    filter: Record<string, unknown>,
    select?: string,
  ) => Promise<Array<{ files?: Array<{ file_id?: string }> | null }> | null>;
  getFiles: (
    filter: Record<string, unknown>,
    sort?: Record<string, 1 | -1> | null,
    select?: Record<string, 0 | 1>,
  ) => Promise<StoredFile[] | null>;
  readPdf?: (file: StoredFile) => Promise<string[]>;
}): Promise<TaskDocument[]> {
  const messages = (await getMessages({ conversationId, user: userId }, 'files')) ?? [];
  const ordered = new Set<string>();
  for (const message of messages) {
    for (const file of message.files ?? []) {
      if (file?.file_id) {
        ordered.add(file.file_id);
      }
    }
  }
  requestFileIds.forEach((id) => ordered.add(id));
  const wanted = fileIds && fileIds.length > 0 ? new Set(fileIds) : null;
  const ids = Array.from(ordered).filter((id) => wanted == null || wanted.has(id));
  if (ids.length === 0) {
    return [];
  }
  const files =
    (await getFiles({ file_id: { $in: ids }, user: userId }, null, {
      file_id: 1,
      filename: 1,
      type: 1,
      text: 1,
      filepath: 1,
      source: 1,
    })) ?? [];
  const byId = new Map(files.map((file) => [file.file_id, file]));

  const docs: TaskDocument[] = [];
  for (const id of ids) {
    const file = byId.get(id);
    if (!file || NON_DOCUMENT_TYPE.test(file.type ?? '')) {
      continue;
    }
    if (file.type === 'application/pdf' && readPdf) {
      let loaded: Promise<TaskDocument> | undefined;
      const loadPages = () => {
        loaded ??= readPdf(file).then(
          (pages) => prepareDocument({ ...file, pages }),
          (error: Error) => {
            logger.warn(
              `[tasks] Could not re-read PDF pages for file ${file.file_id}; using stored text without page numbers: ${error?.message}`,
            );
            return prepareDocument({ ...file, parse: 'text_only' });
          },
        );
        return loaded;
      };
      docs.push({ ...prepareDocument(file), loadPages });
      continue;
    }
    docs.push(prepareDocument(file));
  }
  return docs;
}

export interface TaskRuntimeParams {
  req: ServerRequest;
  agent: TaskAgentModel;
  db: EndpointDbMethods & {
    getMessages: Parameters<typeof loadConversationDocuments>[0]['getMessages'];
    getFiles: Parameters<typeof loadConversationDocuments>[0]['getFiles'];
  };
  models: {
    TaskExtraction: Parameters<typeof createMongoTaskCache>[0]['TaskExtraction'];
    TaskSummary: Parameters<typeof createMongoTaskCache>[0]['TaskSummary'];
    TaskResult: Model<{
      user: unknown;
      conversationId: string;
      resultId: string;
      kind: string;
      result: TaskResult;
    }>;
  };
  getDownloadStream: (file: StoredFile) => Promise<Readable>;
  saveFile: (file: {
    buffer: Buffer;
    filename: string;
    type: string;
  }) => Promise<{ file_id: string; filename: string }>;
  emitProgress?: (event: TaskProgressEvent) => void | Promise<void>;
}

/**
 * The directory the server loaded deployment skills from at startup. Resolving it again
 * here would use the process cwd (`/app/api` in the container) instead of the project root.
 */
function deploymentSkillDirectory(): string {
  const directory = getDeploymentSkillRegistry().getDirectory();
  if (directory == null) {
    throw new Error('Deployment skills are not loaded, so report templates are unavailable.');
  }
  return directory;
}

/** Wires the task tools to the request: user-scoped files, cache, model and storage. */
export function createTaskToolDeps(params: TaskRuntimeParams): TaskToolDeps {
  const { req, agent, db, models } = params;
  const userId = req.user?.id;
  if (!userId) {
    throw new Error('Document task tools need an authenticated user.');
  }
  const conversationId = req.body?.conversationId as string | undefined;
  const requestFiles = (req.body as { files?: Array<{ file_id?: string }> } | undefined)?.files;
  let llm: Promise<TaskLLM> | undefined;

  return {
    conversationId,
    loadDocuments: ({ conversationId: convoId, fileIds }) =>
      loadConversationDocuments({
        userId,
        conversationId: convoId,
        fileIds,
        requestFileIds: (requestFiles ?? []).flatMap((file) =>
          file?.file_id ? [file.file_id] : [],
        ),
        getMessages: db.getMessages,
        getFiles: db.getFiles,
        readPdf: async (file) =>
          extractPdfPages(await readStream(await params.getDownloadStream(file))),
      }),
    getLLM: () => {
      llm ??= createTaskLLM({ req, agent, db, conversationId });
      return llm;
    },
    cache: createMongoTaskCache({
      userId,
      TaskExtraction: models.TaskExtraction,
      TaskSummary: models.TaskSummary,
    }),
    saveResult: async (result) => {
      await models.TaskResult.create({
        user: userId,
        conversationId: result.conversationId,
        resultId: result.resultId,
        kind: result.kind,
        result,
      });
    },
    loadTemplate: (templateId) => loadReportTemplate(templateId, deploymentSkillDirectory()),
    hwp: createHwpService(),
    saveReportFile: ({ buffer, filename }) =>
      params.saveFile({ buffer, filename, type: HWPX_MIME_TYPE }),
    onProgress: params.emitProgress,
  };
}
