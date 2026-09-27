import { isEnabled } from '~/utils/common';

type SearchModelName = 'Conversation' | 'Message';

type SearchDocument = {
  isTemporary?: boolean | null;
  expiredAt?: Date | string | null;
  subagentThread?: object | null;
  subagentTask?: object | null;
};

type SearchIndexHandle = {
  deleteDocuments: (query: { filter: string }) => Promise<{ taskUid: number }>;
};

type SearchClient<TIndex extends SearchIndexHandle> = {
  index: (uid: string) => TIndex;
  waitForTask: (
    taskUid: number,
    options: { timeOutMs: number; intervalMs: number },
  ) => Promise<{ status: string }>;
};

/** `processSyncBatch` exists only when the mongoMeili plugin is registered on the model. */
type SearchModel<TIndex> = {
  processSyncBatch?: (index: TIndex, documents: SearchDocument[]) => Promise<void>;
};

type SearchEnv = {
  SEARCH?: string;
  MEILI_HOST?: string;
  MEILI_MASTER_KEY?: string;
};

export type DemoSearchIndex = {
  /** Deletes every index document of `userId`; primary keys are not unique across users. */
  remove: (model: SearchModelName, userId: string) => Promise<void>;
  add: (model: SearchModelName, documents: SearchDocument[]) => Promise<void>;
};

/** Index names and exclusion paths as registered in `data-schemas` `models/convo.ts` and `models/message.ts`. */
const SEARCH_INDEXES: Record<SearchModelName, { uid: string; excludePath: keyof SearchDocument }> =
  {
    Conversation: { uid: 'convos', excludePath: 'subagentThread' },
    Message: { uid: 'messages', excludePath: 'subagentTask' },
  };

/** Same request timeout as the plugin's `meiliRequestTimeoutMs`; `waitForTask` only bounds polling. */
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/** The plugin indexes `user` as the stored string id and marks it filterable. */
const userFilter = (userId: string): string =>
  `user = "${userId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const hasActiveExpiration = (expiredAt: SearchDocument['expiredAt']): boolean =>
  expiredAt == null || new Date(expiredAt).getTime() > Date.now();

/** Mirrors the plugin's `isIndexableDocument` for raw documents, where a stored `isTemporary` is explicit. */
const isIndexable = (doc: SearchDocument, excludePath: keyof SearchDocument): boolean =>
  doc[excludePath] == null &&
  (doc.isTemporary === false
    ? hasActiveExpiration(doc.expiredAt)
    : doc.isTemporary == null && doc.expiredAt == null);

/**
 * Search index writes for the demo reset, which bypasses the mongoMeili hooks by writing raw
 * collections. Returns undefined when search is off, matching when the plugin's hooks index.
 */
export function createDemoSearchIndex<TIndex extends SearchIndexHandle>({
  env,
  createClient,
  models,
  runAsSystem,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}: {
  env: SearchEnv;
  createClient: (config: { host: string; apiKey: string; timeout: number }) => SearchClient<TIndex>;
  models: Record<SearchModelName, SearchModel<TIndex>>;
  runAsSystem: <T>(action: () => Promise<T>) => Promise<T>;
  requestTimeoutMs?: number;
}): DemoSearchIndex | undefined {
  const { SEARCH, MEILI_HOST: host, MEILI_MASTER_KEY: apiKey } = env;
  if (!isEnabled(SEARCH) || !host || !apiKey) {
    return undefined;
  }
  const client = createClient({ host, apiKey, timeout: requestTimeoutMs });

  const remove = async (model: SearchModelName, userId: string): Promise<void> => {
    const { taskUid } = await client
      .index(SEARCH_INDEXES[model].uid)
      .deleteDocuments({ filter: userFilter(userId) });
    const { status } = await client.waitForTask(taskUid, { timeOutMs: 10_000, intervalMs: 100 });
    if (status !== 'succeeded') {
      throw new Error(`Meili deletion task ${taskUid} ended with ${status}`);
    }
  };

  const add = async (model: SearchModelName, documents: SearchDocument[]): Promise<void> => {
    const { uid, excludePath } = SEARCH_INDEXES[model];
    const indexable = documents.filter((doc) => isIndexable(doc, excludePath));
    if (indexable.length === 0) {
      return;
    }
    const { processSyncBatch } = models[model];
    if (typeof processSyncBatch !== 'function') {
      throw new Error(`Search plugin is not registered on the ${model} model`);
    }
    await runAsSystem(() => processSyncBatch.call(models[model], client.index(uid), indexable));
  };

  return { remove, add };
}
