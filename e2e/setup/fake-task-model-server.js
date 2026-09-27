/**
 * 작업 도구의 문서별 호출에 답하는 OpenAI 호환 픽스처.
 *
 * `extract_table`·`summarize_documents`·`write_report` 는 `e2e/setup/fake-model.js` 가 바꿔 끼우는
 * 그래프 모델을 거치지 않고 대화 agent 의 엔드포인트를 직접 부른다(packages/api/src/tasks/llm.ts).
 * e2e/config/librechat.e2e.yaml 의 `Mock Tasks` 엔드포인트가 `baseURL` 로 이곳을 가리키고, 모든 답을
 * e2e/fixtures/task-mode/documents.json 에서 만들어 spec 이 셀 값을 미리 안다. 호출 수를 종류별로 세어
 * 캐시가 맞았을 때 모델 호출이 없었음을 spec 이 확인할 수 있다.
 */
const http = require('http');
const path = require('path');

const PORT = Number(process.env.E2E_TASK_MODEL_PORT) || 8893;
const fixture = require(path.resolve(__dirname, '../fixtures/task-mode/documents.json'));
const documentsByName = new Map(fixture.documents.map((doc) => [doc.filename, doc]));

const EXTRACT_PROMPT = 'You extract fields from one document.';
const SUMMARY_PROMPT = 'Summarize one document from this viewpoint:';
const MERGE_PROMPT = 'Merge the material below into one summary';
const REPORT_PROMPT = 'You write the prose sections of the report';

const EMPTY_COUNTS = { extract: 0, summary: 0, merge: 0, report: 0, other: 0 };
let counts = { ...EMPTY_COUNTS };
/** 호출 종류별 파일 이름(최신이 끝). spec 이 어떤 문서가 모델에 갔는지 본다. */
let documentsSeen = { extract: [], summary: [] };
/** spec 이 실행 중 상태(사이드바 회전 표시)를 붙잡아 두려고 정하는 호출별 지연. */
let delayMs = 0;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
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

function messageText(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content.map((part) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('\n');
}

function documentName(prompt) {
  return /^Document name: (.+)$/m.exec(prompt)?.[1]?.trim() ?? '';
}

/** 추출 프롬프트의 `  "field": { "value": ..., "quote": ... }` 줄에서 항목 이름을 읽는다. */
function requestedFields(prompt) {
  return Array.from(prompt.matchAll(/^ {2}("(?:[^"\\]|\\.)*"): \{ "value"/gm), (match) =>
    JSON.parse(match[1]),
  );
}

function extractionAnswer(prompt) {
  const doc = documentsByName.get(documentName(prompt));
  return Object.fromEntries(
    requestedFields(prompt).map((field) => {
      const cell = doc?.fields?.[field];
      return [
        field,
        cell ? { value: cell.value, quote: cell.quote } : { value: null, quote: null },
      ];
    }),
  );
}

function summaryAnswer(prompt) {
  const doc = documentsByName.get(documentName(prompt));
  if (!doc) {
    return { summary: '', one_line: '', points: [] };
  }
  return doc.summary;
}

/** 프롬프트에 나온 첫 요점 id 를 인용해 합친 글에 각주가 하나 붙게 한다. */
function mergeAnswer(prompt) {
  const pointId = /\[\^?(d\d+p\d+)\]/.exec(prompt)?.[1] ?? /\b(d\d+p\d+)\b/.exec(prompt)?.[1];
  const marker = pointId ? `[^${pointId}]` : '';
  return {
    trend: `문서 전반에서 위험 요인이 보통 수준으로 유지된다.${marker}`,
    common: '- 대부분의 문서가 전월과 큰 차이가 없다고 적었다.',
  };
}

/** 절마다 한 문장을 쓰고, 각 문장이 프롬프트의 첫 값 id 를 인용한다. */
function reportAnswer(prompt) {
  const sections = Array.from(prompt.matchAll(/^- ("(?:[^"\\]|\\.)*") \(use fields:/gm), (match) =>
    JSON.parse(match[1]),
  );
  const cellId = /\[(c\d+_\d+)\]/.exec(prompt)?.[1];
  const marker = cellId ? `[^${cellId}]` : '';
  return {
    paragraphs: Object.fromEntries(
      sections.map((section) => [section, `${section} 항목은 추출 값에 따라 정리했다.${marker}`]),
    ),
    title_values: { 분기: '3분기' },
  };
}

function answerFor(prompt) {
  if (prompt.includes(EXTRACT_PROMPT)) {
    counts.extract += 1;
    documentsSeen.extract.push(documentName(prompt));
    return extractionAnswer(prompt);
  }
  if (prompt.includes(SUMMARY_PROMPT)) {
    counts.summary += 1;
    documentsSeen.summary.push(documentName(prompt));
    return summaryAnswer(prompt);
  }
  if (prompt.includes(MERGE_PROMPT)) {
    counts.merge += 1;
    return mergeAnswer(prompt);
  }
  if (prompt.includes(REPORT_PROMPT)) {
    counts.report += 1;
    return reportAnswer(prompt);
  }
  counts.other += 1;
  return {};
}

function completionPayload(model, content) {
  return {
    id: `chatcmpl-e2e-task-${Object.values(counts).reduce((sum, count) => sum + count, 0)}`,
    object: 'chat.completion',
    created: 0,
    model: model ?? 'mock-task-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/') {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/__debug/calls') {
    sendJson(res, 200, { counts, documents: documentsSeen });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/__debug/delay') {
    try {
      delayMs = Math.max(0, Number((await readJson(req)).ms) || 0);
    } catch {
      sendJson(res, 400, { error: { message: 'Body is not JSON.' } });
      return;
    }
    sendJson(res, 200, { ok: true, delayMs });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/__debug/reset') {
    counts = { ...EMPTY_COUNTS };
    documentsSeen = { extract: [], summary: [] };
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === 'POST' && url.pathname.endsWith('/chat/completions')) {
    let body;
    try {
      body = await readJson(req);
    } catch {
      sendJson(res, 400, { error: { message: 'Request body is not JSON.' } });
      return;
    }
    const prompt = (body.messages ?? []).map((message) => messageText(message?.content)).join('\n');
    if (body.stream === true) {
      sendJson(res, 400, {
        error: { message: 'The task fixture only serves non-streaming calls.' },
      });
      return;
    }
    const answer = JSON.stringify(answerFor(prompt));
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    sendJson(res, 200, completionPayload(body.model, answer));
    return;
  }
  sendJson(res, 404, { error: { message: `No fixture route for ${req.method} ${url.pathname}` } });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[e2e] fake task model server listening on http://127.0.0.1:${PORT}`);
});
