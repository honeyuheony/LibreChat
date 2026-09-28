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

type HwpFailure = Extract<HwpRenderOutcome, { ok: false }> & { status?: number };

export type HwpFieldsOutcome = { ok: true; fields: string[] } | HwpFailure;
export type HwpFillOutcome = { ok: true; buffer: Buffer; filename?: string } | HwpFailure;

export interface HwpService {
  render(request: HwpRenderRequest, signal?: AbortSignal): Promise<HwpRenderOutcome>;
  /** 양식 안 `{{항목}}` 표시의 이름을 문서에 나온 순서대로 돌려준다. */
  fields(template: Buffer, signal?: AbortSignal): Promise<HwpFieldsOutcome>;
  /** 표시 자리에 값을 채운 HWPX 를 돌려준다. 값이 없는 항목은 빈 글자로 채운다. */
  fill(
    template: Buffer,
    values: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<HwpFillOutcome>;
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

const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** JSON 을 보내고 응답을 받는다. 연결·시간 초과·오류 응답은 `/render` 와 같은 실패 모양으로 바꾼다. */
async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  body: object,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ ok: true; response: Response } | HwpFailure> {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    return { ok: false, code: 'unavailable', message: failureMessage(error) };
  }
  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    return {
      ok: false,
      code: failure?.error ?? 'unavailable',
      message: failure?.message ?? `HTTP ${response.status}`,
      status: response.status,
    };
  }
  return { ok: true, response };
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
    async fields(template, signal) {
      const posted = await postJson(
        fetchImpl,
        `${baseUrl.replace(/\/+$/, '')}/template/fields`,
        { template_b64: template.toString('base64') },
        timeoutMs,
        signal,
      );
      if (!posted.ok) {
        return posted;
      }
      try {
        const body = (await posted.response.json()) as { fields?: unknown };
        const fields = Array.isArray(body.fields)
          ? body.fields.filter((field): field is string => typeof field === 'string')
          : [];
        return { ok: true, fields };
      } catch (error) {
        return { ok: false, code: 'unavailable', message: failureMessage(error) };
      }
    },
    async fill(template, values, signal) {
      const posted = await postJson(
        fetchImpl,
        `${baseUrl.replace(/\/+$/, '')}/template/fill`,
        { template_b64: template.toString('base64'), values },
        timeoutMs,
        signal,
      );
      if (!posted.ok) {
        return posted;
      }
      try {
        const buffer = Buffer.from(await posted.response.arrayBuffer());
        const filename = parseContentDispositionFilename(
          posted.response.headers.get('Content-Disposition'),
        );
        return { ok: true, buffer, ...(filename != null && { filename }) };
      } catch (error) {
        return { ok: false, code: 'unavailable', message: failureMessage(error) };
      }
    },
  };
}
