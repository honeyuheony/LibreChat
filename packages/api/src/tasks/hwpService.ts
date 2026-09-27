/** hwp-mcp 기준 주소를 담는 환경 변수다. 끝에 `/render` 를 붙여 부르고, 기본값은 compose 내부망 주소다. */
export const HWP_MCP_URL_ENV = 'HWP_MCP_URL';
export const DEFAULT_HWP_MCP_URL = 'http://hwp-mcp:8765';
/** 업로드 추출 제한과 같은 30초로 맞췄으며, 양식을 채우는 데 걸리는 시간을 측정해 정한 값은 아니다. */
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
      /** `unavailable` 은 온전한 응답을 받지 못한 경우(서버 중단, 연결 거부, 시간 초과, 본문 끊김)이고 나머지는 hwp-mcp 오류 코드다. */
      code: 'unavailable' | 'unknown_template' | 'invalid_request' | 'render_failed' | string;
      message: string;
    };

export interface HwpService {
  render(request: HwpRenderRequest, signal?: AbortSignal): Promise<HwpRenderOutcome>;
}

/** `filename*=UTF-8''…` 를 먼저 읽고, 없으면 일반 `filename="…"` 를 읽는다. */
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
        // 시간 제한이 본문 읽기까지 걸려 있어서, 멈추거나 끊긴 stream 은 여기서 실패한다
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
