import path from 'path';
import { promises as fs } from 'fs';

export interface ReportSlot {
  id: string;
  kind: 'paragraph' | 'table_fixed_rows' | 'table_rows' | 'list';
  placeholder?: string;
  /** 문단이 근거로 쓸 수 있는 추출 항목이다. 없으면 모든 항목을 쓴다. */
  from?: string[];
  field?: string;
  source?: 'filenames';
  label?: string;
  rows?: string[];
  /** 열 이름마다 채울 추출 항목을 적는다. `@filename` 이면 원본 파일 이름이 들어간다. */
  columns?: Record<string, string>;
  rowField?: string;
  defaults?: Record<string, string>;
}

export interface ReportTemplate {
  templateId: string;
  title: string;
  fields: string[];
  slots: ReportSlot[];
}

const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
/**
 * 스킬 기본 양식 말고 더 있는 양식을 id 로 찾아, 스킬 폴더와 `slots-<variant>.json` 의
 * `-<variant>` 접미사를 얻는다. 같은 id 로 문서를 만드는 hwp-mcp `TEMPLATE_VARIANTS` 와 맞춰 둔다.
 */
const TEMPLATE_VARIANTS: ReadonlyMap<string, { folder: string; variant: string }> = new Map([
  ['hwp-report-general', { folder: 'hwp-report', variant: 'general' }],
]);
const TITLE_PLACEHOLDER = /\{\{([^}]+)\}\}/g;

/**
 * `<skillsDir>/<templateId>/assets/slots.json` 을 읽고, `TEMPLATE_VARIANTS` 에 있는 id 면
 * 그 id 가 가리키는 `slots-<variant>.json` 을 읽는다. hwp-mcp 가 채우는 파일과 같다.
 */
export function resolveReportTemplatePath(templateId: string, skillsDir: string): string {
  if (!TEMPLATE_ID_PATTERN.test(templateId)) {
    throw new Error(`Unknown report template "${templateId}".`);
  }
  const target = TEMPLATE_VARIANTS.get(templateId);
  const folder = target?.folder ?? templateId;
  const slotsFile = target ? `slots-${target.variant}.json` : 'slots.json';
  return path.join(skillsDir, folder, 'assets', slotsFile);
}

export async function loadReportTemplate(
  templateId: string,
  skillsDir: string,
): Promise<ReportTemplate> {
  const slotsPath = resolveReportTemplatePath(templateId, skillsDir);
  let raw: string;
  try {
    raw = await fs.readFile(slotsPath, 'utf8');
  } catch {
    throw new Error(`Unknown report template "${templateId}".`);
  }
  const parsed = JSON.parse(raw) as Omit<ReportTemplate, 'templateId'>;
  if (!Array.isArray(parsed.slots) || !Array.isArray(parsed.fields)) {
    throw new Error(`Report template "${templateId}" has no slots or fields.`);
  }
  return {
    templateId,
    title: parsed.title ?? templateId,
    fields: parsed.fields,
    slots: parsed.slots,
  };
}

/** hwp-mcp 와 똑같이, 채우지 않은 `{{name}}` 은 지우고 그 때문에 비는 괄호도 함께 지운다. */
export function fillTitle(title: string, values: Record<string, string>): string {
  return title
    .replace(TITLE_PLACEHOLDER, (_match, name: string) => values[name.trim()]?.trim() ?? '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function titlePlaceholders(title: string): string[] {
  return Array.from(title.matchAll(TITLE_PLACEHOLDER), (match) => match[1].trim());
}
