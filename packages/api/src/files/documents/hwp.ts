import * as fs from 'fs';
import { assertSafeZipSize } from './zipSafety';

const HWP_MCP_URL = process.env.HWP_MCP_URL ?? 'http://hwp-mcp:8765';
const HWP_MCP_TIMEOUT_MS = 30_000;

export const HWP_UPLOAD_ERRORS = {
  connection:
    '한글 문서 변환 서버에 연결하지 못해 이 파일을 올리지 못했습니다. 잠시 뒤 다시 올려 주세요. 계속되면 관리자에게 알려 주세요.',
  protected:
    '배포용(보호) 한글 문서라 내용을 읽을 수 없습니다. 한글에서 일반 문서로 저장한 뒤 다시 올려 주세요.',
  unreadable: '한글 문서를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.',
} as const;

type HwpExtractResponse = {
  text: string;
  tables: string[][][];
  sections: number;
};

type HwpErrorResponse = {
  error: 'protected' | 'unsupported' | 'unreadable';
  message: string;
};

export async function hwpToText(file: Express.Multer.File): Promise<string> {
  const contents = await fs.promises.readFile(file.path);
  /* HWPX is a ZIP (OWPML) that hwp-mcp inflates, so reject a zip bomb here as
   * docx/xlsx do. HWP 5.0 is a Compound File Binary container (D0 CF 11 E0),
   * not a ZIP; the magic-byte check skips it whatever the declared MIME type. */
  if (contents.length >= 4 && contents[0] === 0x50 && contents[1] === 0x4b) {
    await assertSafeZipSize(contents, { name: file.originalname ?? 'hwpx' });
  }
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(contents)]), file.originalname);
  form.append('filename', file.originalname);

  let response: Response;
  try {
    response = await fetch(`${HWP_MCP_URL.replace(/\/$/, '')}/extract`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(HWP_MCP_TIMEOUT_MS),
    });
  } catch {
    throw new Error(HWP_UPLOAD_ERRORS.connection);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(response.ok ? HWP_UPLOAD_ERRORS.unreadable : HWP_UPLOAD_ERRORS.connection);
  }

  if (!response.ok) {
    const error = parseHwpError(payload);
    if (error?.error === 'protected') {
      throw new Error(HWP_UPLOAD_ERRORS.protected);
    }
    if (error?.error === 'unreadable' || error?.error === 'unsupported') {
      throw new Error(HWP_UPLOAD_ERRORS.unreadable);
    }
    throw new Error(HWP_UPLOAD_ERRORS.connection);
  }

  const extracted = parseHwpResponse(payload);
  if (!extracted) {
    throw new Error(HWP_UPLOAD_ERRORS.unreadable);
  }

  const body = extracted.text.trim();
  const tables = extracted.tables
    .map((table, index) => {
      const rows = table.map((row) => row.join(' | ')).join('\n');
      return `[표 ${index + 1}]${rows ? `\n${rows}` : ''}`;
    })
    .join('\n\n');
  const text = [body, tables].filter(Boolean).join('\n\n');
  if (!text.trim()) {
    throw new Error(HWP_UPLOAD_ERRORS.unreadable);
  }
  return text;
}

function parseHwpResponse(payload: unknown): HwpExtractResponse | undefined {
  if (payload == null || typeof payload !== 'object') {
    return undefined;
  }
  const response = payload as Partial<HwpExtractResponse>;
  if (
    typeof response.text !== 'string' ||
    !Array.isArray(response.tables) ||
    !response.tables.every(
      (table) =>
        Array.isArray(table) &&
        table.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string')),
    ) ||
    typeof response.sections !== 'number'
  ) {
    return undefined;
  }
  return response as HwpExtractResponse;
}

function parseHwpError(payload: unknown): HwpErrorResponse | undefined {
  if (payload == null || typeof payload !== 'object') {
    return undefined;
  }
  const response = payload as Partial<HwpErrorResponse>;
  if (
    (response.error !== 'protected' &&
      response.error !== 'unsupported' &&
      response.error !== 'unreadable') ||
    typeof response.message !== 'string'
  ) {
    return undefined;
  }
  return response as HwpErrorResponse;
}
