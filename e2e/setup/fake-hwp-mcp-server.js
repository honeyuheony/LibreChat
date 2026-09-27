/**
 * Stand-in for hwp-mcp's HTTP routes (`POST /extract`, `POST /render`) in mock e2e.
 *
 * `/extract` answers with the fixture body of the uploaded file's name from
 * e2e/fixtures/task-mode/documents.json, so the committed .hwp/.hwpx fixtures need
 * no real Hangul content. `/render` returns placeholder bytes; it is NOT a valid
 * HWPX, so specs must not validate it. When `E2E_HWP_RENDER_UPSTREAM` names a real
 * hwp-mcp, `/render` is forwarded there instead and the file can be validated.
 *
 * A separate control port lets a spec take the service port down (`POST /down`
 * closes the listener, so connections are refused) and bring it back (`POST /up`).
 */
const http = require('http');
const path = require('path');

const PORT = Number(process.env.E2E_HWP_MCP_PORT) || 8894;
const CONTROL_PORT = Number(process.env.E2E_HWP_CONTROL_PORT) || 8895;
const RENDER_UPSTREAM = process.env.E2E_HWP_RENDER_UPSTREAM?.trim() || '';
const HOST = '127.0.0.1';
const fixture = require(path.resolve(__dirname, '../fixtures/task-mode/documents.json'));
/** Longest name first, so `sample_1.hwp` never matches inside a longer fixture name. */
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

/** The multipart body carries the original name in the `filename` field. */
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
