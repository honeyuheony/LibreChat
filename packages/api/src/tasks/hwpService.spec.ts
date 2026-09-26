import type { HwpRenderRequest } from './hwpService';
import { createHwpService, parseContentDispositionFilename } from './hwpService';

const request: HwpRenderRequest = {
  template_id: 'weekly-report',
  values: {},
  paragraphs: {},
  tables: {},
  footnotes: [],
};

function respond(response: Response) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('parseContentDispositionFilename', () => {
  it('decodes the RFC 5987 UTF-8 filename', () => {
    const header = `attachment; filename*=UTF-8''${encodeURIComponent('정세분석팀 주간보고 초안.hwpx')}`;
    expect(parseContentDispositionFilename(header)).toBe('정세분석팀 주간보고 초안.hwpx');
  });
});

describe('createHwpService', () => {
  it('posts the request to <base>/render and returns bytes with the served file name', async () => {
    const bytes = Buffer.from('PK\u0003\u0004hwpx');
    const { fetchImpl, calls } = respond(
      new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/hwp+zip',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('보고 초안.hwpx')}`,
          'X-Hwp-Title': encodeURIComponent('보고'),
        },
      }),
    );
    const outcome = await createHwpService({ baseUrl: 'http://hwp:8765/', fetchImpl }).render(
      request,
    );
    expect(calls).toEqual([{ url: 'http://hwp:8765/render', body: request }]);
    expect(outcome).toEqual({ ok: true, buffer: bytes, filename: '보고 초안.hwpx', title: '보고' });
  });

  it('passes the hwp-mcp error code through', async () => {
    const { fetchImpl } = respond(
      new Response(JSON.stringify({ error: 'unknown_template', message: 'no such template' }), {
        status: 404,
      }),
    );
    await expect(createHwpService({ fetchImpl }).render(request)).resolves.toEqual({
      ok: false,
      code: 'unknown_template',
      message: 'no such template',
    });
  });

  it('reports unavailable when nothing listens on the port', async () => {
    const outcome = await createHwpService({
      baseUrl: 'http://127.0.0.1:9',
      timeoutMs: 2_000,
    }).render(request);
    expect(outcome).toMatchObject({ ok: false, code: 'unavailable' });
  });
});
