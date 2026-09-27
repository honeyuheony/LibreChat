/**
 * 목 e2e 에서 hwp-mcp 의 HTTP 경로(`POST /extract`, `POST /render`)를 대신한다.
 *
 * `/extract` 는 올린 파일 이름에 맞는 본문을 e2e/fixtures/task-mode/documents.json 에서 찾아
 * 돌려주므로, 저장소에 넣은 .hwp/.hwpx 픽스처에는 실제 한글 내용이 없어도 된다. `/render` 는
 * 자리표시 바이트를 돌려줄 뿐 올바른 HWPX 가 아니므로 spec 에서 검증하면 안 된다.
 * `E2E_HWP_RENDER_UPSTREAM` 에 실제 hwp-mcp 를 주면 `/render` 를 그리로 넘기므로 파일을 검증할 수 있다.
 *
 * 별도 제어 포트로 spec 이 서비스 포트를 내리고(`POST /down`, 연결을 거부한다) 다시 올린다(`POST /up`).
 */
const http = require('http');
const path = require('path');

const PORT = Number(process.env.E2E_HWP_MCP_PORT) || 8894;
const CONTROL_PORT = Number(process.env.E2E_HWP_CONTROL_PORT) || 8895;
const RENDER_UPSTREAM = process.env.E2E_HWP_RENDER_UPSTREAM?.trim() || '';
const HOST = '127.0.0.1';
const fixture = require(path.resolve(__dirname, '../fixtures/task-mode/documents.json'));
/** `sample_1.hwp` 가 더 긴 픽스처 이름 안에서 맞지 않도록 긴 이름부터 찾는다. */
const hangulDocuments = fixture.documents
  .filter((doc) => /\.hwpx?$/i.test(doc.filename))
  .sort((a, b) => b.filename.length - a.filename.length);

let extractCalls = [];
let renderRequests = [];

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** multipart 본문의 `filename` 필드에 원래 이름이 들어 있다. */
function findUploadedDocument(body) {
  return hangulDocuments.find((doc) => body.includes(Buffer.from(doc.filename, 'utf8')));
}

async function handleExtract(req, res) {
  const body = await readBody(req);
  const doc = findUploadedDocument(body);
  extractCalls.push(doc?.filename ?? null);
  if (!doc) {
    sendJson(res, 422, { error: 'unreadable', message: 'No fixture body for this upload.' });
    return;
  }
  sendJson(res, 200, { text: doc.text, tables: [], sections: 1 });
}

async function forwardRender(body, res) {
  const upstream = await fetch(`${RENDER_UPSTREAM.replace(/\/+$/, '')}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const headers = { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' };
  for (const name of ['Content-Disposition', 'X-Hwp-Title', 'X-Hwp-Footnotes']) {
    const value = upstream.headers.get(name);
    if (value != null) {
      headers[name] = value;
    }
  }
  res.writeHead(upstream.status, headers);
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

async function handleRender(req, res) {
  const body = await readBody(req);
  let request;
  try {
    request = JSON.parse(body.toString('utf8'));
  } catch {
    sendJson(res, 400, { error: 'invalid_request', message: 'Body is not JSON.' });
    return;
  }
  renderRequests.push(request);
  if (RENDER_UPSTREAM) {
    await forwardRender(body, res);
    return;
  }
  const title = `${request.template_id} 시험`;
  const filename = `${title} 초안.hwpx`;
  const bytes = Buffer.from(`fake hwpx for ${request.template_id}`, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'application/hwp+zip',
    'Content-Length': bytes.length,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'X-Hwp-Title': encodeURIComponent(title),
    'X-Hwp-Footnotes': String(request.footnotes?.length ?? 0),
  });
  res.end(bytes);
}

const SERVICE_ROUTES = { '/extract': handleExtract, '/render': handleRender };

const service = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const handler = req.method === 'POST' ? SERVICE_ROUTES[url.pathname] : undefined;
  if (!handler) {
    sendJson(res, 404, { error: 'not_found', message: `${req.method} ${url.pathname}` });
    return;
  }
  handler(req, res).catch((error) => {
    sendJson(res, 500, { error: 'render_failed', message: error?.message ?? String(error) });
  });
});

let serviceUp = false;

function startService() {
  return new Promise((resolve) => {
    if (serviceUp) {
      resolve();
      return;
    }
    service.listen(PORT, HOST, () => {
      serviceUp = true;
      resolve();
    });
  });
}

function stopService() {
  return new Promise((resolve) => {
    if (!serviceUp) {
      resolve();
      return;
    }
    service.close(() => {
      serviceUp = false;
      resolve();
    });
    service.closeAllConnections();
  });
}

const control = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${CONTROL_PORT}`);
  if (req.method === 'GET' && url.pathname === '/') {
    sendJson(res, 200, { ok: true, up: serviceUp });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/calls') {
    sendJson(res, 200, { up: serviceUp, extract: extractCalls, render: renderRequests });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/reset') {
    extractCalls = [];
    renderRequests = [];
    await startService();
    sendJson(res, 200, { ok: true, up: serviceUp });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/down') {
    await stopService();
    sendJson(res, 200, { ok: true, up: serviceUp });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/up') {
    await startService();
    sendJson(res, 200, { ok: true, up: serviceUp });
    return;
  }
  sendJson(res, 404, { error: 'not_found' });
});

startService().then(() => {
  control.listen(CONTROL_PORT, HOST, () => {
    console.log(
      `[e2e] fake hwp-mcp listening on http://${HOST}:${PORT} (control ${CONTROL_PORT}` +
        `${RENDER_UPSTREAM ? `, render → ${RENDER_UPSTREAM}` : ''})`,
    );
  });
});
