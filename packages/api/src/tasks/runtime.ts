import path from 'path';
import { logger } from '@librechat/data-schemas';
import type { TaskProgressEvent, TaskResult } from 'librechat-data-provider';
import type { Readable } from 'stream';
import type { Model } from 'mongoose';
import type { EndpointDbMethods, ServerRequest } from '~/types';
import type { DeploymentSkill } from '~/skills/deployment';
import type { TaskAgentModel, TaskLLM } from './llm';
import type { TaskDocument } from './documents';
import type { TaskToolDeps } from './tools';
import { loadReportTemplate, resolveReportTemplatePath } from './template';
import { getDeploymentSkillRegistry } from '~/skills/deployment';
import { isDeploymentSkillVisibleTo } from '~/skills/market';
import { createHwpService } from './hwpService';
import { createMongoTaskCache } from './cache';
import { prepareDocument } from './documents';
import { createTaskLLM } from './llm';

export interface StoredFile {
  file_id: string;
  filename: string;
  type?: string;
  text?: string | null;
  filepath?: string;
  source?: string;
}

/** 읽을 text 가 없는 파일(이미지·오디오·동영상)은 작업 문서로 보지 않는다. */
const NON_DOCUMENT_TYPE = /^(image|audio|video)\//;
const HWPX_MIME_TYPE = 'application/hwp+zip';

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** 쪽별 text 를 얻는다. 저장된 File `text` 는 쪽을 줄바꿈 하나로 이어 붙여서 쪽 번호를 잃는다. */
export async function extractPdfPages(data: Buffer): Promise<string[]> {
  // ESM 전용 pdfjs 빌드가 없어도 Jest 가 이 모듈을 읽을 수 있게 함수 안에서 불러온다
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
 * 대화에 올라온 파일을 오래된 메시지부터 모으되, 사용자가 소유한 파일로만 한정한다.
 * 모델이 주는 `fileIds` 는 이 목록을 좁힐 수만 있고 늘릴 수는 없다.
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
 * 서버가 시작할 때 배포 스킬을 읽어 들인 폴더다. 여기서 다시 계산하면 프로젝트 루트가 아니라
 * 프로세스 cwd(컨테이너에서는 `/app/api`)를 기준으로 삼게 된다.
 */
function deploymentSkillDirectory(): string {
  const directory = getDeploymentSkillRegistry().getDirectory();
  if (directory == null) {
    throw new Error('Deployment skills are not loaded, so report templates are unavailable.');
  }
  return directory;
}

/** 이 파일을 등록한 배포 스킬이다. 어느 스킬에도 속하지 않은 양식이면 없다. */
function findFileOwner(filepath: string): DeploymentSkill | undefined {
  const target = path.resolve(filepath);
  return getDeploymentSkillRegistry()
    .list()
    .find((skill) => skill.files.some((file) => path.resolve(file.filepath) === target));
}

/** task tool 에 요청의 사용자 범위 파일, cache, 모델, 저장소를 연결한다. */
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
    loadTemplate: async (templateId) => {
      const skillsDir = deploymentSkillDirectory();
      const owner = findFileOwner(resolveReportTemplatePath(templateId, skillsDir));
      if (!owner || !isDeploymentSkillVisibleTo(owner, req.user)) {
        throw new Error(`Unknown report template "${templateId}".`);
      }
      return loadReportTemplate(templateId, skillsDir);
    },
    hwp: createHwpService(),
    saveReportFile: ({ buffer, filename }) =>
      params.saveFile({ buffer, filename, type: HWPX_MIME_TYPE }),
    onProgress: params.emitProgress,
  };
}
