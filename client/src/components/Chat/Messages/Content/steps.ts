import type { TranslationKeys } from '~/hooks';
import { cleanToolError, isError } from './ToolOutput';

/** Human-readable tool step lines: a verb phrase from the tool name and arguments, plus a result summary.
 *  Korean particles depend on the word before them, so phrases take them as `{{1}}`. */

type Localize = (key: TranslationKeys, values?: Record<string, string | number>) => string;
type Args = Record<string, unknown>;

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
const FINAL_RIEUL = 8;
/** Latin letters and digits read aloud in Korean: L(엘) M(엠) N(엔) R(알) end in a final consonant. */
const LATIN_WITH_FINAL = new Set(['l', 'm', 'n', 'r']);
const LATIN_WITH_RIEUL = new Set(['l', 'r']);
/** 영 일 삼 육 칠 팔 end in a final consonant; 일 칠 팔 in ㄹ. */
const DIGIT_WITH_FINAL = new Set(['0', '1', '3', '6', '7', '8']);
const DIGIT_WITH_RIEUL = new Set(['1', '7', '8']);

type FinalSound = 'none' | 'rieul' | 'other';

function finalSound(word: string): FinalSound {
  const trimmed = word.replace(/[^\p{L}\p{N}]+$/u, '');
  const last = trimmed.slice(-1).toLowerCase();
  if (!last) {
    return 'none';
  }
  const code = last.charCodeAt(0);
  if (code >= HANGUL_FIRST && code <= HANGUL_LAST) {
    const jong = (code - HANGUL_FIRST) % 28;
    if (jong === 0) {
      return 'none';
    }
    return jong === FINAL_RIEUL ? 'rieul' : 'other';
  }
  if (DIGIT_WITH_FINAL.has(last)) {
    return DIGIT_WITH_RIEUL.has(last) ? 'rieul' : 'other';
  }
  if (LATIN_WITH_FINAL.has(last)) {
    return LATIN_WITH_RIEUL.has(last) ? 'rieul' : 'other';
  }
  return 'none';
}

/** 을/를 */
export function objectParticle(word: string): string {
  return finalSound(word) === 'none' ? '를' : '을';
}

/** 이/가 */
export function subjectParticle(word: string): string {
  return finalSound(word) === 'none' ? '가' : '이';
}

/** 으로/로 — ㄹ 받침 뒤에도 '로' 를 쓴다. */
export function directionParticle(word: string): string {
  return finalSound(word) === 'other' ? '으로' : '로';
}

export function parseToolArgs(args: unknown): Args {
  if (args != null && typeof args === 'object' && !Array.isArray(args)) {
    return args as Args;
  }
  if (typeof args !== 'string' || args.trim() === '') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(args);
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Args)
      : {};
  } catch {
    // Streaming args arrive as partial JSON; the phrase falls back to its argument-free form.
    return {};
  }
}

function stringArg(args: Args, ...names: string[]): string {
  for (const name of names) {
    const value = args[name];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function hostName(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** MCP servers written in TypeScript use dashes (`tavily-search`); tool keys may keep either form. */
function normalizeToolName(name: string): string {
  return name.replace(/-/g, '_');
}

type PhraseBuilder = (args: Args, localize: Localize) => string;

function withObject(key: TranslationKeys, word: string, localize: Localize): string {
  return localize(key, { 0: word, 1: objectParticle(word) });
}

const listFolder: PhraseBuilder = (args, localize) => {
  const path = stringArg(args, 'path', 'dir');
  return path
    ? localize('com_ui_tool_step_list_folder_path', { 0: baseName(path) })
    : localize('com_ui_tool_step_list_folder');
};

const readFile: PhraseBuilder = (args, localize) => {
  const path = stringArg(args, 'path', 'file_path');
  return path
    ? withObject('com_ui_tool_step_read_file', baseName(path), localize)
    : localize('com_ui_tool_step_read_file_generic');
};

const searchFiles: PhraseBuilder = (args, localize) => {
  const pattern = stringArg(args, 'pattern', 'query');
  return localize('com_ui_tool_step_search_files', {
    0: pattern,
    1: subjectParticle(pattern),
  });
};

const webSearch: PhraseBuilder = (args, localize) =>
  withObject('com_ui_tool_step_web_search', stringArg(args, 'query', 'q'), localize);

/** Tool name (MCP function half, dashes as underscores) → verb phrase. */
export const TOOL_STEP_PHRASES: Record<string, PhraseBuilder> = {
  // 내 PC 폴더 (desk-relay)
  list_folder: listFolder,
  read_file: readFile,
  search_files: searchFiles,
  read_hangul_file: readFile,
  // 공유 폴더 문서 (@modelcontextprotocol/server-filesystem)
  list_directory: listFolder,
  list_directory_with_sizes: listFolder,
  directory_tree: listFolder,
  read_text_file: readFile,
  read_media_file: readFile,
  read_multiple_files: (args, localize) =>
    localize('com_ui_tool_step_read_multiple_files', {
      0: Array.isArray(args.paths) ? args.paths.length : 0,
    }),
  get_file_info: (args, localize) =>
    localize('com_ui_tool_step_file_info', { 0: baseName(stringArg(args, 'path')) }),
  list_allowed_directories: (_args, localize) => localize('com_ui_tool_step_list_allowed'),
  write_file: (args, localize) =>
    withObject('com_ui_tool_step_write_file', baseName(stringArg(args, 'path')), localize),
  edit_file: (args, localize) =>
    withObject('com_ui_tool_step_edit_file', baseName(stringArg(args, 'path')), localize),
  create_directory: (args, localize) =>
    localize('com_ui_tool_step_create_folder', { 0: baseName(stringArg(args, 'path')) }),
  move_file: (args, localize) =>
    withObject('com_ui_tool_step_move_file', baseName(stringArg(args, 'source')), localize),
  // 한글 문서 읽기 (hwp-mcp)
  list_hangul_files: (_args, localize) => localize('com_ui_tool_step_list_hangul_files'),
  read_hangul_text: readFile,
  read_hangul_tables: (args, localize) =>
    localize('com_ui_tool_step_read_tables', { 0: baseName(stringArg(args, 'path')) }),
  // 웹 검색 (tavily-mcp) and the built-in web search
  tavily_search: webSearch,
  web_search: webSearch,
  tavily_extract: (_args, localize) => localize('com_ui_tool_step_web_extract'),
  tavily_crawl: (args, localize) =>
    localize('com_ui_tool_step_web_crawl', { 0: hostName(stringArg(args, 'url')) }),
  tavily_map: (args, localize) =>
    localize('com_ui_tool_step_web_crawl', { 0: hostName(stringArg(args, 'url')) }),
  // Google 캘린더와 메일 (google-mcp)
  calendar_list_events: (_args, localize) => localize('com_ui_tool_step_calendar_list'),
  calendar_create_event: (args, localize) =>
    withObject('com_ui_tool_step_calendar_create', stringArg(args, 'title'), localize),
  gmail_search: (args, localize) =>
    withObject('com_ui_tool_step_mail_search', stringArg(args, 'query'), localize),
  gmail_read: (_args, localize) => localize('com_ui_tool_step_mail_read'),
  // Slack 메시지 (korotovsky/slack-mcp-server)
  channels_list: (_args, localize) => localize('com_ui_tool_step_slack_channels'),
  conversations_history: (_args, localize) => localize('com_ui_tool_step_slack_history'),
  conversations_replies: (_args, localize) => localize('com_ui_tool_step_slack_replies'),
  conversations_search_messages: (args, localize) =>
    withObject('com_ui_tool_step_slack_search', stringArg(args, 'search_query', 'query'), localize),
  conversations_add_message: (_args, localize) => localize('com_ui_tool_step_slack_send'),
};

export function describeToolStep(
  toolName: string,
  args: unknown,
  localize: Localize,
  displayName: string = toolName,
): string {
  const build = TOOL_STEP_PHRASES[normalizeToolName(toolName)];
  if (build == null) {
    return localize('com_ui_tool_step_unknown', { 0: displayName });
  }
  return build(parseToolArgs(args), localize);
}

/** Tools whose output is a list; FastMCP sends each list item as its own JSON text block. */
const LIST_TOOLS = new Set([
  'list_folder',
  'search_files',
  'list_hangul_files',
  'list_directory',
  'list_directory_with_sizes',
]);
const TEXT_READ_TOOLS = new Set([
  'read_file',
  'read_hangul_file',
  'read_text_file',
  'read_hangul_text',
]);
/** What FastMCP returns for an empty list. */
const EMPTY_MCP_RESPONSE = '(No response)';

function countListItems(output: string): number | null {
  const trimmed = output.trim();
  if (trimmed === EMPTY_MCP_RESPONSE || trimmed === '') {
    return 0;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.length : 1;
  } catch {
    // Several JSON blocks separated by blank lines, or plain lines from server-filesystem.
  }
  const blocks = trimmed.split(/\n\s*\n/).filter((block) => block.trim() !== '');
  if (blocks.length > 1) {
    return blocks.length;
  }
  return trimmed.split('\n').filter((line) => line.trim() !== '').length;
}

/** Short right-hand summary of a finished step, or null when nothing useful fits. */
export function summarizeToolOutput(
  toolName: string,
  output: string | null | undefined,
  localize: Localize,
): string | null {
  if (typeof output !== 'string' || isError(output.trim())) {
    return null;
  }
  const name = normalizeToolName(toolName);
  if (LIST_TOOLS.has(name)) {
    const count = countListItems(output);
    return count == null ? null : localize('com_ui_tool_step_count', { 0: count });
  }
  if (TEXT_READ_TOOLS.has(name) && output.trim() !== '') {
    return localize('com_ui_tool_step_lines', { 0: output.trim().split('\n').length });
  }
  return null;
}

/** The readable failure message of a step, without the transport prefixes. */
export function getToolErrorMessage(output: string | null | undefined): string | null {
  if (typeof output !== 'string') {
    return null;
  }
  const trimmed = output.trim();
  return isError(trimmed) ? cleanToolError(trimmed) : null;
}

const ARG_SUMMARY_LIMIT = 3;
const ARG_VALUE_LIMIT = 40;

/** One line of the leading arguments ("path: memo.txt · pattern: 예산") for an approval card. */
export function summarizeToolArgs(args: unknown): string {
  return Object.entries(parseToolArgs(args))
    .filter(([, value]) => value != null && value !== '')
    .slice(0, ARG_SUMMARY_LIMIT)
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      return `${key}: ${text.length > ARG_VALUE_LIMIT ? `${text.slice(0, ARG_VALUE_LIMIT)}…` : text}`;
    })
    .join(' · ');
}
