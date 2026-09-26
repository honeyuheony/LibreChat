/** 기준 주소. 끝에 `/render` 를 붙여 부른다. compose 내부망 주소가 기본값이다. */
export const HWP_MCP_URL_ENV = 'HWP_MCP_URL';
export const DEFAULT_HWP_MCP_URL = 'http://hwp-mcp:8765';
/** 설계 문서의 업로드 추출 제한(30초)을 그대로 쓴 값이며 양식 채움 시간은 측정하지 않았다. */
export const HWP_RENDER_TIMEOUT_MS = 30_000;

export interface HwpRenderRequest {
  template_id: string;
  values: Record<string, string>;
  paragraphs: Record<string, string | string[]>;
  tables: Record<
    string,
    Record<string, Record<string, string | null>> | Array<Record<string, string | null>>
  >;
  footnotes: Array<{ n: number; text: string }>;
}

export type HwpRenderOutcome =
  | { ok: true; buffer: Buffer; filename: string; title?: string }
  | {
      ok: false;
      /** `unavailable` = no full answer (down, refused, timed out, body cut off); the rest are hwp-mcp error codes. */
      code: 'unavailable' | 'unknown_template' | 'invalid_request' | 'render_failed' | string;
      message: string;
    };

export interface HwpService {
  render(request: HwpRenderRequest, signal?: AbortSignal): Promise<HwpRenderOutcome>;
}

/** Reads `filename*=UTF-8''…` first, then a plain `filename="…"`. */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      return null;
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

function decodeHeader(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function createHwpService({
  baseUrl = process.env[HWP_MCP_URL_ENV] || DEFAULT_HWP_MCP_URL,
  fetchImpl = fetch,
  timeoutMs = HWP_RENDER_TIMEOUT_MS,
}: {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}): HwpService {
  return {
    async render(request, signal) {
      const timeout = AbortSignal.timeout(timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
      } catch (error) {
        return {
          ok: false,
          code: 'unavailable',
          message: error instanceof Error ? error.message : String(error),
        };
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        return {
          ok: false,
          code: body?.error ?? 'unavailable',
          message: body?.message ?? `HTTP ${response.status}`,
        };
      }
      let buffer: Buffer;
      try {
        // The timeout also covers the body, so a stalled or reset stream fails here
        buffer = Buffer.from(await response.arrayBuffer());
      } catch (error) {
        return {
          ok: false,
          code: 'unavailable',
          message: error instanceof Error ? error.message : String(error),
        };
      }
      const title = decodeHeader(response.headers.get('X-Hwp-Title'));
      const filename =
        parseContentDispositionFilename(response.headers.get('Content-Disposition')) ??
        `${title ?? request.template_id} 초안.hwpx`;
      return { ok: true, buffer, filename, ...(title != null && { title }) };
    },
  };
}
