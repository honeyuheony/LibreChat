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

/** `processSyncBatch` 는 모델에 mongoMeili 플러그인이 등록됐을 때만 있다. */
type SearchModel<TIndex> = {
  processSyncBatch?: (index: TIndex, documents: SearchDocument[]) => Promise<void>;
};

type SearchEnv = {
  SEARCH?: string;
  MEILI_HOST?: string;
  MEILI_MASTER_KEY?: string;
};

export type DemoSearchIndex = {
  /** 기본 키가 사용자끼리 겹칠 수 있어 `userId` 의 색인 문서를 모두 지운다. */
  remove: (model: SearchModelName, userId: string) => Promise<void>;
  add: (model: SearchModelName, documents: SearchDocument[]) => Promise<void>;
};

/** `data-schemas` 의 `models/convo.ts`·`models/message.ts` 에 등록된 색인 이름과 제외 경로를 그대로 쓴다. */
const SEARCH_INDEXES: Record<SearchModelName, { uid: string; excludePath: keyof SearchDocument }> =
  {
    Conversation: { uid: 'convos', excludePath: 'subagentThread' },
    Message: { uid: 'messages', excludePath: 'subagentTask' },
  };

/** 플러그인의 `meiliRequestTimeoutMs` 와 같은 요청 제한 시간이다. `waitForTask` 는 폴링 시간만 제한한다. */
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/** 플러그인은 `user` 를 저장된 문자열 id 로 색인하고 필터에 쓸 수 있게 표시한다. */
const userFilter = (userId: string): string =>
  `user = "${userId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const hasActiveExpiration = (expiredAt: SearchDocument['expiredAt']): boolean =>
  expiredAt == null || new Date(expiredAt).getTime() > Date.now();

/** 플러그인의 `isIndexableDocument` 를 원시 문서용으로 옮긴 것이다. 원시 문서에서는 저장된 `isTemporary` 값이 그대로 드러난다. */
const isIndexable = (doc: SearchDocument, excludePath: keyof SearchDocument): boolean =>
  doc[excludePath] == null &&
  (doc.isTemporary === false
    ? hasActiveExpiration(doc.expiredAt)
    : doc.isTemporary == null && doc.expiredAt == null);

/**
 * 데모 초기화는 컬렉션에 직접 써서 mongoMeili 훅을 거치지 않으므로 검색 색인을 따로 쓴다.
 * 플러그인 훅이 색인하지 않는 조건과 맞춰, 검색이 꺼져 있으면 undefined 를 돌려준다.
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
