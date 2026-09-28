import { randomUUID } from 'crypto';
import { logger } from '@librechat/data-schemas';
import { TaskTools } from 'librechat-data-provider';
import { tool } from '@librechat/agents/langchain/tools';
import type { StructuredToolInterface } from '@librechat/agents/langchain/tools';
import type { TaskDocResult, TaskResult } from 'librechat-data-provider';
import type { LCTool } from '@librechat/agents';
import type { Readable } from 'stream';
import type { Types } from 'mongoose';
import type { TaskResultArtifact } from './tools';
import type { HwpService } from './hwpService';
import { resolveDownloadPath } from '~/storage/path';
import { TASK_RESULT_ARTIFACT } from './tools';

export const FILL_REPORT_TEMPLATE_TOOL: TaskTools.fill_report_template =
  TaskTools.fill_report_template;

const TEMPLATE_PATH = /^assets\/[^/]+\.hwpx$/i;
const MAX_TEMPLATE_BYTES = 5_000_000;
const MAX_TEMPLATE_FIELDS = 100;
const MAX_FIELD_NAME_CHARS = 200;
const FIELD_LOOKUP_TIMEOUT_MS = 5_000;
const FIELD_LOOKUP_FAILURE_TTL_MS = 60_000;

/** 캐시 크기의 근거는 없다. 스킬 버전마다 한 줄이라 작게 둔다. */
const MAX_CACHED_FIELD_LISTS = 200;
const failedFieldCache = new Map<string, number>();

/** 이번 turn 에 채울 수 있는 양식. 바이트는 turn 을 시작할 때 읽어 둔 것을 그대로 쓴다. */
export interface ReportTemplateFile {
  name: string;
  skillName: string;
  relativePath: string;
  fields: string[];
  buffer: Buffer;
}

type SkillId = Types.ObjectId | string;

export interface SkillTemplateSource {
  listSkillFiles(skillId: SkillId): Promise<Array<{ relativePath: string; filename?: string }>>;
  readSkillFile(skillId: SkillId, relativePath: string): Promise<Buffer | null>;
}

interface StoredSkillFile {
  relativePath: string;
  filename?: string;
  filepath: string;
  storageKey?: string | null;
  source: string;
  bytes: number;
}

/** 스킬 파일 기록을 찾아 저장소에서 바이트를 읽는다. 저장소는 호출한 쪽이 `source` 별로 고른다. */
export function createSkillTemplateSource(deps: {
  listSkillFiles(skillId: SkillId): Promise<StoredSkillFile[]>;
  getSkillFileByPath(skillId: SkillId, relativePath: string): Promise<StoredSkillFile | null>;
  getDownloadStream(source: string, path: string): Promise<Readable | NodeJS.ReadableStream>;
}): SkillTemplateSource {
  return {
    listSkillFiles: deps.listSkillFiles,
    async readSkillFile(skillId, relativePath) {
      const file = await deps.getSkillFileByPath(skillId, relativePath);
      if (!file || file.bytes > MAX_TEMPLATE_BYTES) {
        return null;
      }
      const stream = await deps.getDownloadStream(file.source, resolveDownloadPath(file));
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer | string>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    },
  };
}

interface TemplateSkill {
  _id: SkillId;
  name: string;
  version?: number;
}

export interface FindReportTemplatesDeps extends SkillTemplateSource {
  hwp: Pick<HwpService, 'fields'>;
  /** `<스킬 id>:<버전>:<경로>` 마다 필드 목록. 스킬 파일이 바뀌면 버전이 올라 새로 묻는다. */
  fieldCache?: Map<string, string[]>;
}

export function createFieldCache(): Map<string, string[]> {
  return new Map();
}

function remember<T>(cache: Map<string, T> | undefined, key: string, value: T): void {
  if (!cache) {
    return;
  }
  if (!cache.has(key) && cache.size >= MAX_CACHED_FIELD_LISTS) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  cache.set(key, value);
}

function hasRecentFieldFailure(key: string): boolean {
  const expiresAt = failedFieldCache.get(key);
  if (expiresAt === undefined) {
    return false;
  }
  if (expiresAt > Date.now()) {
    return true;
  }
  failedFieldCache.delete(key);
  return false;
}

function validFieldName(field: string): boolean {
  let characters = 0;
  for (const character of field) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined ||
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029
    ) {
      return false;
    }
    characters += 1;
    if (characters > MAX_FIELD_NAME_CHARS) {
      return false;
    }
  }
  return true;
}

function templateFieldNames(fields: string[]): string[] {
  return fields.slice(0, MAX_TEMPLATE_FIELDS).filter(validFieldName);
}

function createFieldProperties(
  templates: ReportTemplateFile[],
): Record<string, { type: 'string' }> {
  const fields = new Set<string>();
  for (const template of templates) {
    for (const field of templateFieldNames(template.fields)) {
      fields.add(field);
    }
  }
  return Object.fromEntries([...fields].map((field) => [field, { type: 'string' }] as const));
}

async function templateFields(
  skill: TemplateSkill,
  relativePath: string,
  buffer: Buffer,
  deps: FindReportTemplatesDeps,
): Promise<string[]> {
  const key = `${skill._id.toString()}:${skill.version ?? 0}:${relativePath}`;
  const cached = deps.fieldCache?.get(key);
  if (cached) {
    return templateFieldNames(cached);
  }
  if (hasRecentFieldFailure(key)) {
    return [];
  }
  const outcome = await deps.hwp.fields(buffer, AbortSignal.timeout(FIELD_LOOKUP_TIMEOUT_MS));
  if (!outcome.ok) {
    remember(failedFieldCache, key, Date.now() + FIELD_LOOKUP_FAILURE_TTL_MS);
    logger.warn(
      `[fill_report_template] Could not read the fields of ${skill.name}/${relativePath}: ${outcome.code}`,
    );
    return [];
  }
  const fields = templateFieldNames(outcome.fields);
  remember(deps.fieldCache, key, fields);
  return fields;
}

/** 스킬의 assets 에 있는 .hwpx 가운데 `{{항목}}` 표시가 있는 양식만 돌려준다. HWP 바이너리는 채울 수 없어 뺀다. */
export async function findReportTemplates(
  skills: TemplateSkill[],
  deps: FindReportTemplatesDeps,
): Promise<ReportTemplateFile[]> {
  const perSkill = await Promise.all(
    skills.map(async (skill) => {
      const files = (await deps.listSkillFiles(skill._id)).filter((file) =>
        TEMPLATE_PATH.test(file.relativePath),
      );
      const found = await Promise.all(
        files.map(async (file) => {
          const buffer = await deps.readSkillFile(skill._id, file.relativePath);
          if (!buffer) {
            return null;
          }
          const fields = await templateFields(skill, file.relativePath, buffer, deps);
          if (fields.length === 0) {
            return null;
          }
          return {
            name: file.filename || file.relativePath.slice('assets/'.length),
            skillName: skill.name,
            relativePath: file.relativePath,
            fields,
            buffer,
          };
        }),
      );
      return found.filter((template): template is ReportTemplateFile => template != null);
    }),
  );
  const templates = perSkill.flat();
  const counts = new Map<string, number>();
  for (const template of templates) {
    counts.set(template.name, (counts.get(template.name) ?? 0) + 1);
  }
  return templates.map((template) =>
    (counts.get(template.name) ?? 0) > 1
      ? { ...template, name: `${template.skillName}/${template.name}` }
      : template,
  );
}

export function buildReportTemplateDefinition(templates: ReportTemplateFile[]): LCTool {
  const list = templates
    .map((template) => `- ${template.name}: ${templateFieldNames(template.fields).join(', ')}`)
    .join('\n');
  return {
    name: FILL_REPORT_TEMPLATE_TOOL,
    description: [
      '사용자가 agent 에 붙인 HWPX 보고서 양식의 {{항목}} 자리에 값을 채워 HWPX 파일로 돌려준다.',
      '보고서 문서를 만들어야 할 때, 결과물 내용을 정한 뒤 항목마다 값을 넣어 부른다. 값의 줄바꿈은 새 문단이 된다.',
      '채울 수 있는 양식과 항목:',
      list,
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        template: {
          type: 'string',
          enum: templates.map((template) => template.name),
          description: '채울 양식 파일 이름',
        },
        values: {
          type: 'object',
          properties: createFieldProperties(templates),
          additionalProperties: false,
          description: '항목 이름마다 채울 글',
        },
      },
      required: ['template', 'values'],
    },
    responseFormat: 'content_and_artifact',
  };
}

const templatesByRequest = new WeakMap<object, ReportTemplateFile[]>();

/** turn 을 시작할 때 찾은 양식. 도구를 실행할 때는 이 목록 밖의 양식을 읽지 않는다. */
export function reportTemplatesFor(req: object | undefined): ReportTemplateFile[] {
  return (req && templatesByRequest.get(req)) ?? [];
}

type TemplatePrime = TemplateSkill & { body?: string };

export interface AttachReportTemplateToolParams extends FindReportTemplatesDeps {
  req: object;
  config: {
    toolDefinitions?: LCTool[];
    toolRegistry?: Map<string, LCTool>;
    manualSkillPrimes?: TemplatePrime[];
    alwaysApplySkillPrimes?: TemplatePrime[];
  };
}

/**
 * 이번 turn 의 스킬(공유 권한을 거친 manual·always-apply)에 채울 양식이 있으면 도구를 등록한다.
 * hwp-mcp 에 닿지 못하면 도구 없이 turn 을 이어 간다.
 */
export async function attachReportTemplateTool({
  req,
  config,
  ...deps
}: AttachReportTemplateToolParams): Promise<ReportTemplateFile[]> {
  const skills = [...(config.manualSkillPrimes ?? []), ...(config.alwaysApplySkillPrimes ?? [])];
  if (skills.length === 0) {
    return [];
  }
  let templates: ReportTemplateFile[];
  try {
    templates = await findReportTemplates(skills, deps);
  } catch (error) {
    logger.warn('[fill_report_template] Could not look up report templates', error);
    return [];
  }
  if (templates.length === 0) {
    return [];
  }
  const definition = buildReportTemplateDefinition(templates);
  config.toolDefinitions = [...(config.toolDefinitions ?? []), definition];
  config.toolRegistry ??= new Map();
  config.toolRegistry.set(FILL_REPORT_TEMPLATE_TOOL, definition);
  templatesByRequest.set(req, [...reportTemplatesFor(req), ...templates]);
  return templates;
}

export interface FillReportTemplateToolDeps {
  templates: ReportTemplateFile[];
  hwp: Pick<HwpService, 'fill'>;
  saveReportFile(file: { buffer: Buffer; filename: string }): Promise<{
    file_id: string;
    filename: string;
  }>;
  saveResult(result: TaskResult): Promise<void>;
  conversationId?: string;
  createId?: () => string;
  now?: () => number;
}

type ToolReturn = [string, Record<string, TaskResultArtifact> | undefined];

interface FillToolConfig {
  configurable?: { thread_id?: string };
  signal?: AbortSignal;
}

/** 모델이 넘긴 값 가운데 양식에 있는 항목의 글자·숫자만 남긴다. */
function pickValues(fields: string[], raw: unknown): Record<string, string> {
  const given = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const values: Record<string, string> = {};
  for (const field of fields) {
    const value = given[field];
    if (typeof value === 'string' || typeof value === 'number') {
      values[field] = String(value);
    }
  }
  return values;
}

const EMPTY_STATS: TaskDocResult['stats'] = {
  docs: 0,
  reflected: 0,
  none: 0,
  low: 0,
  textOnly: 0,
  cached: 0,
  seconds: 0,
};

async function fillTemplate(
  args: { template?: unknown; values?: unknown },
  deps: FillReportTemplateToolDeps,
  context: { conversationId: string; signal?: AbortSignal },
): Promise<ToolReturn> {
  const template = deps.templates.find((item) => item.name === args.template);
  if (!template) {
    const names = deps.templates.map((item) => item.name).join(', ');
    return [`채울 수 있는 양식은 ${names} 입니다. 이 가운데 하나를 골라 다시 부르세요.`, undefined];
  }
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const fields = templateFieldNames(template.fields);
  const values = pickValues(fields, args.values);
  const filled = await deps.hwp.fill(template.buffer, values, context.signal);
  if (!filled.ok) {
    return [
      `한글 문서 변환 서버가 양식을 채우지 못했습니다(${filled.code}). HWPX 파일을 만들었다고 말하지 말고, 잠시 뒤 다시 시도하라고 안내하세요.`,
      undefined,
    ];
  }
  const file = await deps.saveReportFile({
    buffer: filled.buffer,
    filename: filled.filename ?? template.name,
  });
  const result: TaskDocResult = {
    kind: 'report',
    resultId: (deps.createId ?? randomUUID)(),
    conversationId: context.conversationId,
    title: template.skillName,
    body: fields.map((field) => `${field}: ${values[field] ?? ''}`).join('\n'),
    footnotes: [],
    file,
    stats: { ...EMPTY_STATS, seconds: Math.round((now() - startedAt) / 1000) },
    createdAt: new Date(now()).toISOString(),
  };
  await deps.saveResult(result);
  return [
    `양식 ${template.name}을 채운 파일(${file.filename})을 결과 카드에 표시했습니다. 파일은 카드에서 내려받을 수 있습니다. 채운 내용을 다시 쓰지 말고 짧게 답하세요.`,
    {
      [TASK_RESULT_ARTIFACT]: {
        resultId: result.resultId,
        kind: result.kind,
        title: result.title,
        stats: result.stats,
        file,
      },
    },
  ];
}

/** 모델에게 보이는 정의보다 느슨하게 받아, 없는 양식·글자가 아닌 값은 아래에서 안내하거나 거른다. */
const LOOSE_ARGUMENTS: Record<string, unknown> = {
  type: 'object',
  properties: { template: { type: 'string' }, values: { type: 'object' } },
  required: ['template'],
};

export function createFillReportTemplateTool(
  deps: FillReportTemplateToolDeps,
): StructuredToolInterface {
  const definition = buildReportTemplateDefinition(deps.templates);
  return tool(
    async (rawArgs: unknown, config?: FillToolConfig): Promise<ToolReturn> => {
      const conversationId = config?.configurable?.thread_id ?? deps.conversationId;
      if (!conversationId) {
        return ['대화 정보를 찾지 못해 양식을 채우지 못했습니다.', undefined];
      }
      return fillTemplate((rawArgs ?? {}) as { template?: unknown; values?: unknown }, deps, {
        conversationId,
        signal: config?.signal,
      });
    },
    {
      name: definition.name,
      description: definition.description ?? '',
      schema: LOOSE_ARGUMENTS,
      responseFormat: 'content_and_artifact',
    },
  );
}
