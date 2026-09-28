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

  it('reports unavailable instead of throwing when the body cannot be read', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error('socket hang up'));
      },
    });
    const { fetchImpl } = respond(new Response(body, { status: 200 }));
    await expect(createHwpService({ fetchImpl }).render(request)).resolves.toEqual({
      ok: false,
      code: 'unavailable',
      message: 'socket hang up',
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

describe('createHwpService template fields and fill', () => {
  const template = Buffer.from('PK\u0003\u0004template');

  it('asks /template/fields with the template in base64 and returns the field names', async () => {
    const { fetchImpl, calls } = respond(
      new Response(JSON.stringify({ fields: ['출장 목적', '출장 기간'] }), { status: 200 }),
    );
    const outcome = await createHwpService({ baseUrl: 'http://hwp:1/', fetchImpl }).fields(
      template,
    );

    expect(calls).toEqual([
      { url: 'http://hwp:1/template/fields', body: { template_b64: template.toString('base64') } },
    ]);
    expect(outcome).toEqual({ ok: true, fields: ['출장 목적', '출장 기간'] });
  });

  it('reports a fields error body as a failure code', async () => {
    const { fetchImpl } = respond(
      new Response(JSON.stringify({ error: 'invalid_request', message: 'not hwpx' }), {
        status: 422,
      }),
    );
    const outcome = await createHwpService({ fetchImpl }).fields(template);
    expect(outcome).toEqual({ ok: false, code: 'invalid_request', message: 'not hwpx' });
  });

  it('posts the template and values to /template/fill and returns the filled bytes', async () => {
    const filled = Buffer.from('PK\u0003\u0004filled');
    const { fetchImpl, calls } = respond(
      new Response(filled, {
        status: 200,
        headers: {
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('출장보고 양식.hwpx')}`,
        },
      }),
    );
    const outcome = await createHwpService({ baseUrl: 'http://hwp:1', fetchImpl }).fill(template, {
      '출장 목적': '박람회 참관',
    });

    expect(calls).toEqual([
      {
        url: 'http://hwp:1/template/fill',
        body: { template_b64: template.toString('base64'), values: { '출장 목적': '박람회 참관' } },
      },
    ]);
    expect(outcome).toEqual({ ok: true, buffer: filled, filename: '출장보고 양식.hwpx' });
  });
});
