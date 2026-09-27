import path from 'path';
import { promises as fs } from 'fs';
import type { TaskDocResult } from 'librechat-data-provider';
import type { HwpRenderRequest } from './hwpService';
import type { FootnoteSource } from './verify';
import type { ExtractedRow } from './extract';
import type { TaskLLM } from './llm';
import { formatFootnote, normalizeQuote, numberFootnotes } from './verify';
import { countExtractionStats } from './aggregate';
import { normalizeKey } from './cache';
import { invokeJson } from './llm';

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
const FILENAME_COLUMN = '@filename';
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

/** 추출 칸 하나의 각주 id 로, 문서 번호와 항목 번호를 모두 1부터 센다. */
export function cellId(rowIndex: number, fieldIndex: number): string {
  return `c${rowIndex + 1}_${fieldIndex + 1}`;
}

/** 확인된(`ok`) 칸만 인용할 수 있다. `low` 값은 믿을 만한 위치가 없다. */
export function collectCellSources(rows: readonly ExtractedRow[]): Map<string, FootnoteSource> {
  const sources = new Map<string, FootnoteSource>();
  rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, fieldIndex) => {
      if (cell.status === 'ok' && cell.evidence) {
        sources.set(cellId(rowIndex, fieldIndex), {
          file_id: row.doc.file_id,
          filename: row.doc.filename,
          evidence: cell.evidence,
        });
      }
    });
  });
  return sources;
}

type CellText = string | null;

interface SlotContent {
  paragraphs: Record<string, string | string[]>;
  fixedTables: Record<string, Record<string, Record<string, CellText>>>;
  rowTables: Record<string, Array<Record<string, CellText>>>;
}

function citedValue(rows: readonly ExtractedRow[], rowIndex: number, fieldIndex: number) {
  const cell = rows[rowIndex].cells[fieldIndex];
  if (cell?.value == null) {
    return null;
  }
  return cell.status === 'ok' ? `${cell.value}[^${cellId(rowIndex, fieldIndex)}]` : cell.value;
}

/** 여러 문서의 값을 중복 없이 잇는다. 값이 있는 문서가 없으면 `null` 이다. */
function joinDistinct(
  rows: readonly ExtractedRow[],
  rowIndexes: number[],
  fieldIndex: number,
  separator: string,
): CellText {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const rowIndex of rowIndexes) {
    const value = rows[rowIndex].cells[fieldIndex]?.value;
    if (value == null || seen.has(value)) {
      continue;
    }
    seen.add(value);
    parts.push(citedValue(rows, rowIndex, fieldIndex) as string);
  }
  return parts.length > 0 ? parts.join(separator) : null;
}

/** 코드가 채우는 칸(표와 목록)을 추출 결과로 모두 채우고, 문단은 비워 둔다. */
export function assembleCodeSlots(
  template: ReportTemplate,
  fields: readonly string[],
  rows: readonly ExtractedRow[],
): SlotContent {
  const fieldIndex = (name: string | undefined) =>
    name == null ? -1 : fields.indexOf(normalizeKey(name));
  const reflected = rows.flatMap((row, index) => (row.reflected ? [index] : []));
  const content: SlotContent = { paragraphs: {}, fixedTables: {}, rowTables: {} };

  for (const slot of template.slots) {
    if (slot.kind === 'list' && slot.source === 'filenames') {
      content.paragraphs[slot.id] = rows.map((row) => row.doc.filename);
    } else if (slot.kind === 'list') {
      const index = fieldIndex(slot.field);
      content.paragraphs[slot.id] =
        index < 0
          ? []
          : reflected.flatMap((rowIndex) => {
              const text = joinDistinct(rows, [rowIndex], index, '');
              return text == null ? [] : [text];
            });
    } else if (slot.kind === 'table_fixed_rows') {
      const labelIndex = fieldIndex(slot.rowField);
      const table: Record<string, Record<string, CellText>> = {};
      for (const label of slot.rows ?? []) {
        const matching =
          labelIndex < 0
            ? []
            : reflected.filter((rowIndex) => {
                const value = rows[rowIndex].cells[labelIndex]?.value;
                return value != null && normalizeQuote(value).includes(normalizeQuote(label));
              });
        table[label] = Object.fromEntries(
          Object.entries(slot.columns ?? {}).map(([column, field]) => {
            const index = fieldIndex(field);
            return [column, index < 0 ? null : joinDistinct(rows, matching, index, ' / ')];
          }),
        );
      }
      content.fixedTables[slot.id] = table;
    } else if (slot.kind === 'table_rows') {
      const columns = Object.entries(slot.columns ?? {});
      /* 칸 이름과 같은 항목(금주 실적)을 받는 열에 값이 있어야 행을 만든다. 담당처럼 여러 표가
       * 함께 쓰는 열만으로 모든 표에 행이 생기면 안 되기 때문이다. */
      const keyColumns = columns.filter(
        ([, field]) => normalizeKey(field) === normalizeKey(slot.id),
      );
      content.rowTables[slot.id] = reflected.flatMap((rowIndex) => {
        const cells: Record<string, CellText> = {};
        for (const [column, field] of columns) {
          if (field === FILENAME_COLUMN) {
            cells[column] = rows[rowIndex].doc.filename;
            continue;
          }
          const index = fieldIndex(field);
          const text = index < 0 ? null : citedValue(rows, rowIndex, index);
          if (text != null) {
            cells[column] = text;
          }
        }
        const decisive = keyColumns.length > 0 ? keyColumns : columns;
        const hasValue = decisive.some(
          ([column, field]) => field !== FILENAME_COLUMN && cells[column] != null,
        );
        return hasValue ? [cells] : [];
      });
    }
  }
  return content;
}

export function buildReportWriterPrompt({
  template,
  fields,
  rows,
  paragraphSlots,
  placeholders,
}: {
  template: ReportTemplate;
  fields: readonly string[];
  rows: readonly ExtractedRow[];
  paragraphSlots: ReportSlot[];
  placeholders: string[];
}): string {
  const data = rows.flatMap((row, rowIndex) => {
    if (!row.reflected) {
      return [];
    }
    const lines = row.cells.flatMap((cell, fieldIndex) =>
      cell.value == null
        ? []
        : [
            cell.status === 'ok'
              ? `  [${cellId(rowIndex, fieldIndex)}] ${fields[fieldIndex]}: ${cell.value}`
              : `  (unverified) ${fields[fieldIndex]}: ${cell.value}`,
          ],
    );
    return [`- ${row.doc.filename}`, ...lines];
  });
  const slotLines = paragraphSlots.map(
    (slot) => `- ${JSON.stringify(slot.id)} (use fields: ${(slot.from ?? fields).join(', ')})`,
  );
  return [
    `You write the prose sections of the report 「${template.title}」 from extracted values only.`,
    'Answer with a single JSON object and nothing else, in Korean:',
    '{ "paragraphs": { "<section id>": "text" }, "title_values": { "<name>": "value" } }',
    'Write 2-5 sentences per section. Do not state anything the values below do not support.',
    'After each sentence that uses a value, append the value id as a footnote marker like [^c3_2]. Use only ids listed below.',
    '',
    'Sections:',
    ...slotLines,
    '',
    placeholders.length > 0
      ? `Title values to fill (use a short value, or "" when unknown): ${placeholders.join(', ')}`
      : 'No title values are needed; return "title_values": {}.',
    '',
    'Extracted values:',
    ...data,
  ].join('\n');
}

function escapeTableCell(text: CellText): string {
  return (text ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
}

function markdownTable(header: string[], body: string[][]): string[] {
  return [
    `| ${header.map(escapeTableCell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((cells) => `| ${cells.map(escapeTableCell).join(' | ')} |`),
  ];
}

function renderBody(title: string, template: ReportTemplate, content: SlotContent): string {
  const lines: string[] = [`# ${title}`];
  for (const slot of template.slots) {
    lines.push('', `## ${slot.id}`);
    if (slot.kind === 'paragraph') {
      lines.push((content.paragraphs[slot.id] as string | undefined) ?? '');
    } else if (slot.kind === 'list') {
      const items = (content.paragraphs[slot.id] as string[] | undefined) ?? [];
      lines.push(...items.map((item) => `- ${item}`));
    } else if (slot.kind === 'table_fixed_rows') {
      const columns = Object.keys(slot.columns ?? {});
      const table = content.fixedTables[slot.id] ?? {};
      lines.push(
        ...markdownTable(
          [slot.label ?? '', ...columns],
          (slot.rows ?? []).map((label) => [
            label,
            ...columns.map((column) => table[label]?.[column] ?? ''),
          ]),
        ),
      );
    } else {
      const columns = Object.keys(slot.columns ?? {});
      const tableRows = content.rowTables[slot.id] ?? [];
      lines.push(
        ...markdownTable(
          columns,
          tableRows.map((row) =>
            columns.map((column) => row[column] ?? slot.defaults?.[column] ?? ''),
          ),
        ),
      );
    }
  }
  return lines.join('\n');
}

/** 모든 칸의 `[^cX_Y]` 에 양식 순서대로 번호를 매긴 뒤 칸 내용을 다시 만든다. */
function numberSlotFootnotes(
  template: ReportTemplate,
  content: SlotContent,
  sources: ReadonlyMap<string, FootnoteSource>,
) {
  const texts: string[] = [];
  const setters: Array<(text: string) => void> = [];
  const track = (text: CellText, set: (text: string) => void) => {
    if (text != null) {
      texts.push(text);
      setters.push(set);
    }
  };
  for (const slot of template.slots) {
    const paragraph = content.paragraphs[slot.id];
    if (typeof paragraph === 'string') {
      track(paragraph, (text) => (content.paragraphs[slot.id] = text));
    } else if (Array.isArray(paragraph)) {
      paragraph.forEach((item, index) => track(item, (text) => (paragraph[index] = text)));
    }
    const fixed = content.fixedTables[slot.id];
    for (const row of Object.values(fixed ?? {})) {
      for (const column of Object.keys(row)) {
        track(row[column], (text) => (row[column] = text));
      }
    }
    for (const row of content.rowTables[slot.id] ?? []) {
      for (const column of Object.keys(row)) {
        track(row[column], (text) => (row[column] = text));
      }
    }
  }
  const numbered = numberFootnotes(texts, sources);
  numbered.texts.forEach((text, index) => setters[index](text));
  return { footnotes: numbered.footnotes, removed: numbered.removed };
}

export interface ReportOutcome {
  result: TaskDocResult;
  render: HwpRenderRequest;
}

/** 모델을 한 번 불러 문단을 쓰고, 코드가 채우는 칸을 채우고, 각주에 번호를 매긴다. HWPX 는 만들지 않는다. */
export async function composeReport({
  resultId,
  conversationId,
  template,
  fields,
  rows,
  llm,
  signal,
  startedAt,
  now = Date.now,
}: {
  resultId: string;
  conversationId: string;
  template: ReportTemplate;
  fields: string[];
  rows: readonly ExtractedRow[];
  llm: TaskLLM;
  signal?: AbortSignal;
  startedAt: number;
  now?: () => number;
}): Promise<ReportOutcome> {
  const content = assembleCodeSlots(template, fields, rows);
  const paragraphSlots = template.slots.filter((slot) => slot.kind === 'paragraph');
  const placeholders = titlePlaceholders(template.title);
  let titleValues: Record<string, string> = {};

  if (paragraphSlots.length > 0 || placeholders.length > 0) {
    const reply = await invokeJson(
      llm,
      buildReportWriterPrompt({ template, fields, rows, paragraphSlots, placeholders }),
      signal,
    );
    const written = (reply.paragraphs ?? {}) as Record<string, unknown>;
    for (const slot of paragraphSlots) {
      const text = written[slot.id];
      content.paragraphs[slot.id] = typeof text === 'string' ? text.trim() : '';
    }
    const rawValues = (reply.title_values ?? {}) as Record<string, unknown>;
    titleValues = Object.fromEntries(
      placeholders.flatMap((name) =>
        typeof rawValues[name] === 'string' && (rawValues[name] as string).trim()
          ? [[name, (rawValues[name] as string).trim()]]
          : [],
      ),
    );
  }

  const { footnotes, removed } = numberSlotFootnotes(template, content, collectCellSources(rows));
  const title = fillTitle(template.title, titleValues);
  const stats = countExtractionStats(rows, startedAt, now());
  stats.low += removed;

  return {
    result: {
      kind: 'report',
      resultId,
      conversationId,
      title: `${title} 초안`,
      templateId: template.templateId,
      body: renderBody(title, template, content),
      footnotes,
      stats,
      createdAt: new Date(now()).toISOString(),
    },
    render: {
      template_id: template.templateId,
      values: titleValues,
      paragraphs: content.paragraphs,
      tables: { ...content.fixedTables, ...content.rowTables },
      footnotes: footnotes.map((footnote) => ({ n: footnote.n, text: formatFootnote(footnote) })),
    },
  };
}

const BODY_STILL_AVAILABLE = '본문은 오른쪽에서 확인하고 복사할 수 있습니다.';

export const RENDER_UNAVAILABLE_NOTICE: string = `한글 문서 변환 서버에 연결하지 못했거나 응답이 제시간에 오지 않아 HWP 파일을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요. ${BODY_STILL_AVAILABLE}`;

/** hwp-mcp 오류 코드별 안내 문구다. 여기 없는 코드는 일반 생성 실패 문구를 쓴다. */
const RENDER_FAILURE_NOTICES: Record<string, string> = {
  unavailable: RENDER_UNAVAILABLE_NOTICE,
  unknown_template: `한글 문서 변환 서버에 이 보고서 양식이 등록되어 있지 않아 HWP 파일을 만들지 못했습니다. 관리자에게 양식 등록을 요청해 주세요. ${BODY_STILL_AVAILABLE}`,
  invalid_request: `보고서 내용이 양식이 받는 형식과 맞지 않아 HWP 파일을 만들지 못했습니다. 계속되면 관리자에게 알려 주세요. ${BODY_STILL_AVAILABLE}`,
  render_failed: `한글 문서 변환 서버가 양식을 채우다 실패해 HWP 파일을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요. ${BODY_STILL_AVAILABLE}`,
};

export function renderFailureNotice(code: string): string {
  return RENDER_FAILURE_NOTICES[code] ?? RENDER_FAILURE_NOTICES.render_failed;
}
