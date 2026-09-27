import type { FileSources } from './files';

/**
 * Shared skill validation constants — the single source of truth for name,
 * description, title, body, and file-path length limits. Mirrored by
 * `packages/data-schemas/src/methods/skill.ts`; whenever those constants
 * change, the DB-side validators MUST be updated to match.
 *
 * Exported from `librechat-data-provider` so both frontend form validators
 * and backend Mongoose pre-save hooks use the same literals.
 */
export const SKILL_NAME_MAX_LENGTH = 64;
export const SKILL_DESCRIPTION_MAX_LENGTH = 1024;
export const SKILL_DESCRIPTION_SHORT_THRESHOLD = 20;
export const SKILL_DISPLAY_TITLE_MAX_LENGTH = 128;
/** 스킬 이모지 아이콘 길이 상한. 이모지 하나가 여러 코드 단위로 이루어져도 들어가게 넉넉히 잡았다. */
export const SKILL_ICON_MAX_LENGTH = 16;
export const SKILL_BODY_MAX_LENGTH = 100_000;

/**
 * Kebab-case identifier pattern: must start with a lowercase letter or digit,
 * and contain only lowercase letters, digits, and hyphens. Mirrors the
 * backend `SKILL_NAME_PATTERN` in `packages/data-schemas/src/methods/skill.ts`.
 */
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Source of a skill — where its canonical definition came from.
 * `inline` means the skill was authored directly in LibreChat.
 * `deployment` means the skill was loaded from the server's configured
 * deployment skill directory and is not persisted as a Skill document.
 * `github` is populated by admin-configured GitHub skill sync; `notion` is reserved.
 */
export type SkillSource = 'inline' | 'deployment' | 'github' | 'notion';

/**
 * Category inferred from a skill file's top-level directory prefix.
 * `script` for `scripts/...`, `reference` for `references/...`, `asset` for `assets/...`,
 * everything else (including root-level files) is `other`.
 */
export type SkillFileCategory = 'script' | 'reference' | 'asset' | 'other';

/** Nested object inside a structured frontmatter key. */
export type SkillFrontmatterObject = { [key: string]: SkillFrontmatterValue | undefined };

/**
 * Allowed value types inside a skill's YAML frontmatter. Scalars cover the
 * documented keys; nested arrays and objects describe the structured ones
 * (`hooks`, `metadata`, `references`), which real `SKILL.md` files write as a
 * list, a list of objects, or a map.
 *
 * Still no `unknown` or `any`: the payload is JSON-safe by construction, and
 * the server bounds depth, string length and array size when validating it.
 */
export type SkillFrontmatterValue =
  | string
  | number
  | boolean
  | null
  | SkillFrontmatterValue[]
  | SkillFrontmatterObject;

/**
 * Structured YAML frontmatter for a skill. All keys are optional on the wire
 * because not every skill document carries a complete frontmatter block —
 * `name` and `description` live as first-class columns on `TSkill` itself,
 * and frontmatter is an extension bag for additional fields like `when-to-use`,
 * `allowed-tools`, etc.
 */
export type SkillFrontmatter = {
  name?: string;
  description?: string;
} & Record<string, SkillFrontmatterValue | undefined>;

/**
 * Provenance metadata for skills that originated from an external source
 * (e.g. a GitHub commit SHA or a Notion page id).
 *
 * Populated by external sync workers with upstream identifiers such as source
 * ids, paths, and commit/blob SHAs.
 */
export type SkillSourceMetadata =
  | Record<string, string | number | boolean>
  | {
      provider: 'github';
      sourceId: string;
      upstreamId: string;
      owner: string;
      repo: string;
      ref: string;
      skillPath: string;
      commitSha?: string;
      skillBlobSha?: string;
      syncedAt?: string;
      syncStatus?: 'synced' | 'failed';
      error?: string;
    };

/**
 * A non-blocking coaching hint surfaced alongside a successful create/update
 * response. Unlike validation errors (which return 400 and block the write),
 * warnings ride on the 2xx response so the UI can show inline feedback
 * without rejecting the user's input. Example: "description is too short,
 * Claude may undertrigger this skill".
 */
export type TSkillWarning = {
  field: string;
  code: string;
  message: string;
  severity: 'warning';
};

/**
 * API shape for a full skill (returned by GET `/api/skills/:id`).
 *
 * Field semantics:
 * - `name` is the machine-readable kebab-case identifier Claude sees in its
 *   skill manifest. It's what drives triggering and must be stable across
 *   edits. Unique per author+tenant.
 * - `displayTitle` is the human-readable UI label only. NOT sent to Claude,
 *   NOT part of the trigger path — purely cosmetic.
 * - `description` is the "when to use this skill" sentence. Highest-leverage
 *   field for trigger accuracy; a short/vague one causes undertriggering.
 * - `frontmatter` is the structured YAML bag minus `name`/`description`
 *   (those live as top-level columns). Known keys receive value validation;
 *   unknown keys are retained and reported as non-blocking warnings.
 * - `source`/`sourceMetadata` identify whether the row is user-authored,
 *   deployment-provided, or mirrored from an external source such as GitHub.
 */
export type TSkill = {
  _id: string;
  name: string;
  displayTitle?: string;
  description: string;
  body: string;
  frontmatter?: SkillFrontmatter;
  category?: string;
  /**
   * @deprecated Replaced by the persisted `userInvocable` /
   * `disableModelInvocation` pair derived from frontmatter. Retained
   * temporarily so older form code that hasn't migrated still type-checks;
   * the backend no longer reads or writes it.
   */
  invocationMode?: import('../types').InvocationMode;
  /**
   * Mirrors the `disable-model-invocation` frontmatter field. `true` means
   * the model can no longer invoke this skill via the `skill` tool and the
   * skill is excluded from the catalog injected into the system prompt.
   * Manual `$` invocation is unaffected.
   */
  disableModelInvocation?: boolean;
  /**
   * Mirrors the `user-invocable` frontmatter field. `false` hides the skill
   * from the `$` popover and rejects manual invocation. Defaults to `true`.
   */
  userInvocable?: boolean;
  /**
   * Skill-declared tool allowlist (mirrors the `allowed-tools` frontmatter
   * field). When the skill is invoked, these tools are unioned into the
   * agent's effective tool set for the turn. Tolerant of unknown names —
   * the runtime intersects against the loaded tool registry, so skills
   * referencing yet-to-be-implemented tools import without breaking.
   */
  allowedTools?: string[];
  /** 머리말 `examples` 필드 값. 스킬 마켓 카드에 보이는 예시 프롬프트다. */
  examples?: string[];
  builder?: TSkillBuilderState;
  /** 게시 상태를 기록한 적이 없으면 빠진다. `null` 은 초안이라고 명시한 것이다. */
  publishedAt?: string | null;
  lastTest?: TSkillLastTest;
  author: string;
  authorName: string;
  version: number;
  source: SkillSource;
  sourceMetadata?: SkillSourceMetadata;
  fileCount: number;
  /**
   * When `true`, the skill auto-primes into every turn — no user `$` picks
   * or model discretion required. Surfaced on the list view so the UI can
   * show a pin badge on rows that apply ambiently.
   */
  alwaysApply?: boolean;
  isPublic?: boolean;
  /** 지금 ACL 로 본 공개 범위. 서버가 계산할 때만 싣는다. */
  scope?: TSkillPublishScope;
  /** scope 가 'team' 일 때 부여받은 부서. 작성자가 부서를 옮겼으면 작성자 부서와 다르다. */
  scopeDepartment?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Present on POST/PATCH responses when the server emitted non-blocking
   * coaching warnings (e.g. description too short). Never present on GET
   * responses.
   */
  warnings?: TSkillWarning[];
  /** 관리자가 마지막으로 검수를 승인한 시각(ISO). 없으면 검수받은 적이 없다. */
  reviewedAt?: string;
  /** `reviewedAt` 에 검수를 승인한 관리자 user id. */
  reviewedBy?: string;
  /** 실행 수. 스킬이 쓰인 대화 턴이 끝날 때 1 오른다. */
  useCount?: number;
  /** 실행 시간 합계(초). 원래 값이며, 평균은 `usageMetrics`에 있다. */
  runTimeTotalSeconds?: number;
  /** `runTimeTotalSeconds`에 더해진 측정 횟수. */
  runTimeSampleCount?: number;
  /** 작성자가 입력한 수작업 소요 분. 입력하지 않았으면 없다. */
  manualMinutes?: number;
  /** 응용(fork) 원본 스킬 id. */
  forkOf?: string;
  /** 이 스킬을 원본으로 응용한 스킬 가운데 게시된(작성자 말고도 볼 수 있는) 것의 수. 조회할 때 센다. */
  forkCount?: number;
  /** 원래 값으로 응답을 만들 때 계산한 지표. */
  usageMetrics?: TSkillUsageMetrics;
  /** 마켓 목록과 상세 창에 보이는 이모지 아이콘. */
  icon?: string;
  /** 작성자 부서. 사용자 스킬은 작성자 user 문서에서, 배포 스킬은 `metadata.department`에서 읽는다. */
  authorDepartment?: string;
  /** 배포 스킬 SKILL.md `metadata`에서 읽은 마켓 표시 정보. 사용자 스킬에는 없다. */
  marketProfile?: TSkillMarketProfile;
};

/** 배포 스킬의 마켓 표시 정보(SKILL.md 머리말 `metadata`). 값이 없는 필드는 빠진다. */
export type TSkillMarketProfile = {
  /** `기본`: 전 부서에 기본으로 주는 agent, `공유`: 직원이 만들어 공유한 agent. */
  kind?: string;
  /** 공개 범위(`전 부서` 또는 `팀`). `팀`이면 같은 부서 사용자에게만 보인다. */
  scope?: string;
  version?: string;
  /** 이럴 때 쓰세요: 부르는 말. */
  triggers?: string[];
  /** 일하는 방법 한 줄 요약. */
  pipeline?: string;
  output?: string;
  /** 읽는 자료. */
  sources?: string[];
  /** 바탕이 된 기본 agent의 이름(slug). */
  base?: string;
};

/**
 * 스킬 지표. 회당 단축 분은 정수로 반올림하고, 누적 절감 시간도 정수로 반올림한다.
 * 값을 낼 수 없으면(측정 기록이나 수작업 분이 없으면) `null`이다.
 */
export type TSkillUsageMetrics = {
  /** 평균 실행 시간(초, 소수 첫째 자리). */
  averageRunSeconds: number | null;
  /** 회당 단축 시간(분, 정수). */
  savedMinutesPerRun: number | null;
  /** 누적 절감 시간(시간, 정수). */
  savedHours: number | null;
};

export type TSkillMetricsAgent = {
  id: string;
  name: string;
  displayTitle?: string;
  authorName: string;
  authorDepartment?: string;
  runs: number;
  forks: number;
  savedHours: number | null;
};

export type TSkillMetricsContributor = {
  authorName: string;
  department?: string;
  agents: number;
  runs: number;
  forks: number;
  savedHours: number;
};

export type TSkillMetricsReport = {
  agents: { total: number; base: number; staff: number };
  runs: { total: number; staff: number };
  forks: { total: number; forkedAgents: number };
  savedHours: { total: number; staff: number };
  ranking: TSkillMetricsAgent[];
  baseTotal: {
    count: number;
    authorName?: string;
    runs: number;
    forks: number;
    savedHours: number;
  };
  contributors: TSkillMetricsContributor[];
};

/**
 * Summary shape used in list endpoints — omits `body`, `frontmatter` and
 * `builder` to keep list payloads small. Callers that need the full body/frontmatter must fetch
 * the detail via `GET /api/skills/:id`.
 */
export type TSkillSummary = Omit<TSkill, 'body' | 'frontmatter' | 'builder'>;

/**
 * Metadata for a single file bundled inside a skill.
 * File content itself is fetched separately via the file download endpoint.
 */
export type TSkillFile = {
  _id: string;
  skillId: string;
  relativePath: string;
  file_id: string;
  filename: string;
  filepath: string;
  storageKey?: string;
  storageRegion?: string;
  source: FileSources;
  mimeType: string;
  bytes: number;
  category: SkillFileCategory;
  isExecutable: boolean;
  author: string;
  tenantId?: string;
  sourceMetadata?: Record<string, string | number | boolean>;
  /** Lazily cached text content (≤ 512 KB). Excluded from list responses. */
  content?: string;
  /** Set on first read. `true` prevents repeated storage reads for non-text files. */
  isBinary?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TGitHubSkillSyncCredentialSummary = {
  provider: 'github';
  credentialKey: string;
  credentialPresent: boolean;
  tokenFingerprint?: string;
  updatedAt?: string;
  createdAt?: string;
};

/** One upstream skill a sync run dropped, with the reason it was dropped. */
export type TGitHubSkillSyncSkippedSkill = {
  path: string;
  name?: string;
  errorCode: string;
  errorMessage: string;
};

/** One upstream file a sync run published a skill without, and why. */
export type TGitHubSkillSyncSkippedFile = {
  path: string;
  skillPath: string;
  errorCode: string;
  errorMessage: string;
};

export type TGitHubSkillSyncSourceStatus = {
  provider: 'github';
  sourceId: string;
  tenantId?: string;
  /** `partial`: some skills published, others were skipped (see `skippedSkills`). */
  status: 'idle' | 'running' | 'succeeded' | 'partial' | 'failed' | 'skipped';
  credentialKey?: string;
  credentialPresent: boolean;
  owner?: string;
  repo?: string;
  ref?: string;
  paths?: string[];
  startedAt?: string;
  finishedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  errorCode?: string;
  errorMessage?: string;
  syncedSkillCount: number;
  syncedFileCount: number;
  deletedSkillCount: number;
  deletedFileCount: number;
  skippedSkillCount: number;
  skippedSkills?: TGitHubSkillSyncSkippedSkill[];
  skippedFileCount: number;
  skippedFiles?: TGitHubSkillSyncSkippedFile[];
  updatedAt?: string;
  createdAt?: string;
};

export type TGitHubSkillSyncStatusResponse = {
  enabled: boolean;
  intervalMinutes: number;
  runOnStartup: boolean;
  sources: TGitHubSkillSyncSourceStatus[];
  credentials: TGitHubSkillSyncCredentialSummary[];
  fineGrainedTokenRecommendation: string;
};

export type TGitHubSkillSyncCredentialUpdateRequest = {
  token: string;
};

export type TGitHubSkillSyncManualRunResponse = {
  status: 'started' | 'skipped' | 'completed' | 'failed';
  message?: string;
  sources?: TGitHubSkillSyncSourceStatus[];
};

export type TSkillBuilderState = {
  text: string;
  direct: boolean;
  textBy?: string;
  sources: Record<string, string>;
  aiOff: string[];
};

export type TSkillLastTest = {
  version: number;
  seconds: number;
  conversationId: string;
  at: string;
};

/** Request body for POST `/api/skills`. */
export type TCreateSkill = {
  name: string;
  displayTitle?: string;
  description: string;
  body: string;
  frontmatter?: Partial<SkillFrontmatter>;
  category?: string;
  /** When `true`, the skill auto-primes into every turn (mirrors always-apply frontmatter). */
  alwaysApply?: boolean;
  /** 이모지 아이콘. */
  icon?: string;
  builder?: TSkillBuilderState;
};

/** Partial payload for PATCH `/api/skills/:id` — all fields optional. */
export type TUpdateSkillPayload = {
  name?: string;
  displayTitle?: string;
  description?: string;
  body?: string;
  frontmatter?: Partial<SkillFrontmatter>;
  category?: string;
  alwaysApply?: boolean;
  /** 수작업 소요 분(0 이상 정수). */
  manualMinutes?: number;
  /** 이모지 아이콘. */
  icon?: string;
  builder?: TSkillBuilderState;
};

/** 편집기가 만드는 결과물 종류. */
export type TSkillDraftOutput = 'report' | 'organize' | 'summary' | 'draft' | 'ask';
export const SKILL_DRAFT_OUTPUTS: readonly TSkillDraftOutput[] = [
  'report',
  'organize',
  'summary',
  'draft',
  'ask',
];

/** 결과물에 덧붙이는 처리. */
export type TSkillDraftExtra = 'translate' | 'polish' | 'law';
export const SKILL_DRAFT_EXTRAS: readonly TSkillDraftExtra[] = ['translate', 'polish', 'law'];

/** 스킬 파일이 놓이는 폴더. 폴더가 곧 파일 종류다(양식·예시·참고). */
export type TSkillFileKind = 'assets' | 'examples' | 'references';

/** POST `/api/skills/draft` 요청 본문. `context.conversationId` 는 요청한 사람의 대화여야 한다. */
export type TSkillDraftRequest = {
  text: string;
  direct?: boolean;
  files?: Array<{ name: string }>;
  context?: { conversationId: string };
};

/**
 * AI 초안 제안. 서버는 모든 칸을 채워 돌려주고, 사람이 고친 칸을 덮지 않는 일은 브라우저가 맡는다.
 * `origin` 은 모델 응답을 받아들였는지(`model`) 규칙 기반 값으로 채웠는지(`rules`)를 알린다.
 */
export type TSkillDraft = {
  slug: string;
  title: string;
  description: string;
  triggers: string[];
  output: TSkillDraftOutput;
  extras: TSkillDraftExtra[];
  fields: string[];
  icon: string;
  steps: string[];
  connectors: string[];
  fileKinds: Array<{ name: string; kind: TSkillFileKind }>;
  origin: 'model' | 'rules';
};

/** POST `/api/skills/:id/test-result` 요청 본문. `version` 은 시험한 스킬 버전이다. */
export type TSkillTestResultRequest = {
  conversationId: string;
  version: number;
};

/** 게시 범위. 전 부서(public viewer), 우리 팀(작성자 부서 그룹 viewer), 나만(공개 항목 없음)이다. */
export type TSkillPublishScope = 'all' | 'team' | 'me';

/** POST `/api/skills/:id/publish` 요청 본문. */
export type TSkillPublishRequest = {
  scope: TSkillPublishScope;
};

export type TSkillTestResultVariables = {
  id: string;
  payload: TSkillTestResultRequest;
};

export type TSkillPublishVariables = {
  id: string;
  payload: TSkillPublishRequest;
};

export type TSkillPackSummary = {
  _id: string;
  name: string;
  slug: string;
  description: string;
  icon?: string;
  author: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  skillIds?: string[];
};

export type TSkillPack = TSkillPackSummary & {
  skillIds?: string[];
};

export type TCreateSkillPackRequest = {
  name: string;
  description: string;
  icon?: string;
  skillIds: string[];
};

export type TDeleteSkillPackResponse = {
  deleted: true;
};

/** POST `/api/skills/:id/fork` 요청 본문. 이름을 비우면 원본 이름을 쓰고, 겹치면 `-fork` 꼬리를 붙인다. */
export type TForkSkillRequest = {
  name?: string;
};

/** 응용(fork)으로 만든 새 스킬과 파일 복사 결과. */
export type TForkSkillResponse = TSkill & {
  _forkSummary: {
    filesProcessed: number;
    filesSucceeded: number;
    filesFailed: number;
    errors: Array<{ path: string; status: 'ok' | 'error'; error?: string }>;
  };
};

/** Variables passed into the update mutation: id + expectedVersion + partial payload. */
export type TUpdateSkillVariables = {
  id: string;
  expectedVersion: number;
  payload: TUpdateSkillPayload;
};

/** Response from a successful PATCH — includes the bumped version. */
export type TUpdateSkillResponse = TSkill;

/** Response from a 409 concurrency conflict — includes the current authoritative state. */
export type TSkillConflictResponse = {
  error: 'skill_version_conflict';
  current: TSkill;
};

/** Query params for GET `/api/skills` (list). */
export type TSkillListRequest = {
  category?: string;
  search?: string;
  limit?: number;
  cursor?: string;
};

/** Paginated list response. `after` is the cursor to pass for the next page. */
export type TSkillListResponse = {
  skills: TSkillSummary[];
  has_more: boolean;
  after: string | null;
};

/** GET `/api/skills/categories` 응답에 담기는 분류 하나의 건수. */
export type TSkillCategoryCount = {
  value: string;
  count: number;
};

/** GET `/api/skills/categories` 응답. */
export type TSkillCategoriesResponse = {
  categories: TSkillCategoryCount[];
  total: number;
};

/** Response from DELETE `/api/skills/:id`. */
export type TDeleteSkillResponse = {
  id: string;
  deleted: true;
};

/** Response from GET `/api/skills/:id/files`. */
export type TListSkillFilesResponse = {
  files: TSkillFile[];
};

/**
 * Upload body for POST `/api/skills/:id/files`.
 * In phase 1 the backend responds with 501; the client contract is still defined here
 * so hooks are stable when the upload pipeline is wired up in phase 2.
 */
export type TUploadSkillFilePayload = {
  relativePath: string;
};

/** Response from DELETE `/api/skills/:id/files/:relativePath`. */
export type TDeleteSkillFileResponse = {
  skillId: string;
  relativePath: string;
  deleted: true;
};

/** Response from GET `/api/skills/:id/files/:relativePath` (JSON mode). */
export type TSkillFileContentResponse = {
  content?: string;
  mimeType: string;
  isBinary: boolean;
  relativePath: string;
  filename: string;
  bytes: number;
};

/** Variables passed into the skill file upload mutation. */
export type TUploadSkillFileVariables = {
  skillId: string;
  formData: FormData;
};

/** Variables passed into the skill file delete mutation. */
export type TDeleteSkillFileVariables = {
  skillId: string;
  relativePath: string;
};

/**
 * Per-user skill active/inactive overrides (GET response and POST body payload).
 * Key = skill ObjectId string, value = explicit active state.
 * Skills absent from the map use the ownership-based default:
 * owned = active, shared = `defaultActiveOnShare` from config.
 */
export type TSkillStatesResponse = Record<string, boolean>;
