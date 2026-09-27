import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as XLSX from 'xlsx';
import { expect, test } from '@playwright/test';
import type { Locator, Page, Response } from '@playwright/test';
import type { AgentDetail } from './agents.helpers';
import { getAccessToken, isAgentsStream, messagesView, requestJson } from './helpers';
import { getE2EUser } from '../../setup/user';
import { uniqueAgentName } from './agents.helpers';
import { withMongo } from './db';

/**
 * 문서 작업 모드(extract_table · summarize_documents · write_report)를 가짜 대화 모델, 가짜 문서별 모델
 * (e2e/setup/fake-task-model-server.js), 가짜 hwp-mcp(e2e/setup/fake-hwp-mcp-server.js)로 확인한다.
 * 화면은 배포 기본 언어인 한국어로 띄운다.
 */

type FixtureCell = { value: string; quote: string } | null;
type FixtureDocument = {
  filename: string;
  text: string;
  fields: Record<string, FixtureCell>;
};
type Fixture = { fields: string[]; documents: FixtureDocument[] };
type UploadedFile = { file_id: string; filename: string };
type ModelCalls = {
  counts: { extract: number; summary: number; merge: number; report: number; other: number };
};
type HwpCalls = { up: boolean; extract: Array<string | null>; render: unknown[] };

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/task-mode');
const fixture = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, 'documents.json'), 'utf8'),
) as Fixture;
const TASK_MODEL_BASE = `http://127.0.0.1:${process.env.E2E_TASK_MODEL_PORT || '8893'}`;
const HWP_CONTROL_BASE = `http://127.0.0.1:${process.env.E2E_HWP_CONTROL_PORT || '8895'}`;
const HWP_RENDER_UPSTREAM = process.env.E2E_HWP_RENDER_UPSTREAM?.trim() ?? '';

const TABLE_FIELDS = ['정세 전망', '전월 대비', '위험도'];
const REPORT_STAGES = [
  '문서 준비 상태 확인',
  '항목 추출',
  '양식에 채우기(각주 포함)',
  'HWP 생성',
  '결과 저장·검수 안내',
];
const TABLE_STAGES = [
  '문서 준비 상태 확인',
  '항목 확정',
  '전체 문서에서 항목 추출',
  '표 생성·집계(코드)',
  '결과 저장·검수 안내',
];
const SUMMARY_STAGES = [
  '문서 준비 상태 확인',
  '관점 확정',
  '문서별 요약',
  '통합 요약',
  '결과 저장·검수 안내',
];
const HWP_CONNECTION_ERROR =
  '한글 문서 변환 서버에 연결하지 못해 이 파일을 올리지 못했습니다. 잠시 뒤 다시 올려 주세요. 계속되면 관리자에게 알려 주세요.';
const RUN_COMPLETE_TIMEOUT = 60_000;

const uniqueLabel = () => `${Date.now()}${Math.floor(Math.random() * 1e4)}`;

function mimeTypeOf(filename: string): string {
  if (filename.endsWith('.hwpx')) {
    return 'application/hwp+zip';
  }
  if (filename.endsWith('.hwp')) {
    return 'application/x-hwp';
  }
  if (filename.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'text/plain';
}

/** 한글 파일은 자리표시 바이트만 담고, 본문은 가짜 hwp-mcp 가 이름으로 찾아 돌려준다. */
function fixtureFile(filename: string) {
  let buffer: Buffer;
  if (filename.endsWith('.hwpx')) {
    buffer = fs.readFileSync(path.join(FIXTURE_DIR, 'fixture.hwpx'));
  } else if (filename.endsWith('.hwp')) {
    buffer = fs.readFileSync(path.join(FIXTURE_DIR, 'fixture.hwp'));
  } else if (filename.endsWith('.docx')) {
    buffer = fs.readFileSync(path.join(FIXTURE_DIR, 'fixture.docx'));
  } else {
    const doc = fixture.documents.find((entry) => entry.filename === filename);
    buffer = Buffer.from(doc?.text ?? '', 'utf8');
  }
  return { name: filename, mimeType: mimeTypeOf(filename), buffer };
}

function expectedNoneCount(fields: readonly string[]): number {
  return fixture.documents.reduce(
    (sum, doc) => sum + fields.filter((field) => doc.fields[field] == null).length,
    0,
  );
}

async function resetFakes(page: Page) {
  await Promise.all([
    page.request.post(`${TASK_MODEL_BASE}/__debug/reset`),
    page.request.post(`${HWP_CONTROL_BASE}/reset`),
  ]);
}

async function modelCalls(page: Page): Promise<ModelCalls['counts']> {
  const response = await page.request.get(`${TASK_MODEL_BASE}/__debug/calls`);
  return ((await response.json()) as ModelCalls).counts;
}

async function hwpCalls(page: Page): Promise<HwpCalls> {
  const response = await page.request.get(`${HWP_CONTROL_BASE}/calls`);
  return (await response.json()) as HwpCalls;
}

async function createTaskAgent(page: Page): Promise<string> {
  const token = await getAccessToken(page);
  const agent = await requestJson<AgentDetail>(page, {
    path: '/api/agents',
    token,
    method: 'POST',
    body: {
      name: uniqueAgentName('E2E Task Mode Agent'),
      description: 'Runs the document task tools in mock end-to-end tests.',
      instructions: 'Use the document task tools for tables, summaries and reports.',
      provider: 'Mock Tasks',
      model: 'mock-task-model',
      tools: ['extract_table', 'summarize_documents', 'write_report'],
    },
  });
  return agent.id;
}

async function openTaskChat(page: Page): Promise<string> {
  await page.goto('/c/new', { timeout: 10000 });
  const agentId = await createTaskAgent(page);
  await page.goto(`/c/new?agent_id=${encodeURIComponent(agentId)}`, { timeout: 10000 });
  await expect(page.getByRole('textbox', { name: '메시지 입력' })).toBeVisible();
  return agentId;
}

async function deleteAgent(page: Page, agentId: string) {
  const token = await getAccessToken(page);
  // 정리용일 뿐이라 삭제가 실패해도 테스트 결과를 가리지 않게 한다.
  await requestJson(page, {
    path: `/api/agents/${encodeURIComponent(agentId)}`,
    token,
    method: 'DELETE',
  }).catch(() => undefined);
}

const isFilesUpload = (response: Response) =>
  response.request().method() === 'POST' &&
  /\/api\/files(?:\?|$)/.test(new URL(response.url()).pathname);

/** 입력창으로 파일을 붙이고 업로드 응답을 순서대로 모두 돌려준다. */
async function attachFiles(page: Page, filenames: readonly string[]): Promise<Response[]> {
  const responses: Response[] = [];
  const collect = (response: Response) => {
    if (isFilesUpload(response)) {
      responses.push(response);
    }
  };
  page.on('response', collect);
  try {
    await page.getByRole('button', { name: /파일 · 데이터 소스/ }).click();
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menuitem', { name: '내 컴퓨터에서', exact: true }).click(),
    ]);
    await fileChooser.setFiles(filenames.map(fixtureFile));
    await expect.poll(() => responses.length, { timeout: 60_000 }).toBe(filenames.length);
  } finally {
    page.off('response', collect);
  }
  return responses;
}

async function uploadAll(page: Page): Promise<UploadedFile[]> {
  const responses = await attachFiles(
    page,
    fixture.documents.map((doc) => doc.filename),
  );
  const uploaded: UploadedFile[] = [];
  for (const response of responses) {
    expect(response.status(), await response.text()).toBe(200);
    uploaded.push((await response.json()) as UploadedFile);
  }
  return uploaded;
}

async function sendText(page: Page, text: string): Promise<string> {
  const input = page.getByRole('textbox', { name: '메시지 입력' });
  await input.click();
  await input.fill(text);
  const [response] = await Promise.all([
    page.waitForResponse(isAgentsStream, { timeout: 30000 }),
    input.press('Enter'),
  ]);
  const start = (await response.json()) as { conversationId?: string };
  return start.conversationId ?? '';
}

const planCard = (page: Page, tool: string) =>
  messagesView(page).locator(`[data-testid="task-plan-card"][data-tool="${tool}"]`).last();
const resultCard = (page: Page, kind: 'table' | 'summary' | 'report') =>
  messagesView(page).locator(`[data-testid="task-result-card"][data-kind="${kind}"]`).last();
const taskPanel = (page: Page) => page.getByRole('complementary', { name: '작업 패널' });

async function runTable(page: Page, change?: { off?: string; on?: string }): Promise<Locator> {
  await sendText(page, `E2E_TASK_TABLE:${uniqueLabel()}`);
  const card = planCard(page, 'extract_table').getByTestId('task-schema-approval');
  await expect(card).toBeVisible({ timeout: 30000 });
  if (change?.off) {
    await card.getByRole('button', { name: change.off, exact: true }).click();
  }
  if (change?.on) {
    await card.getByRole('button', { name: change.on, exact: true }).click();
  }
  await card.getByRole('button', { name: '실행', exact: true }).click();
  const result = resultCard(page, 'table');
  await expect(result).toBeVisible({ timeout: RUN_COMPLETE_TIMEOUT });
  return result;
}

async function openTableInPanel(page: Page, result: Locator): Promise<Locator> {
  await result.getByRole('button', { name: '표 열기', exact: true }).click();
  const scroll = taskPanel(page).getByTestId('task-table-scroll');
  await expect(scroll).toBeVisible();
  return scroll;
}

async function taskUserId(): Promise<unknown> {
  const email = getE2EUser().email;
  return withMongo(async (db) => (await db.collection('users').findOne({ email }))?._id);
}

async function waitForRunToFinish(page: Page, conversationId: string) {
  const token = await getAccessToken(page);
  await expect
    .poll(
      async () => {
        const messages = await requestJson<
          Array<{ isCreatedByUser?: boolean; unfinished?: boolean }>
        >(page, { path: `/api/messages/${encodeURIComponent(conversationId)}`, token });
        const replies = messages.filter((message) => message.isCreatedByUser === false);
        return replies.length > 0 && replies.every((message) => message.unfinished === false);
      },
      { timeout: RUN_COMPLETE_TIMEOUT },
    )
    .toBe(true);
}

test.describe('작업 모드 목 모델 인수 조건', () => {
  test.describe.configure({ timeout: 180_000 });
  let agentId: string | undefined;

  test.beforeEach(async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'lang', value: 'ko-KR', url: baseURL ?? '' }]);
    await resetFakes(page);
    agentId = await openTaskChat(page);
  });

  test.afterEach(async ({ page }) => {
    await page.request.post(`${HWP_CONTROL_BASE}/up`);
    await page.request.post(`${TASK_MODEL_BASE}/__debug/delay`, { data: { ms: 0 } });
    if (agentId) {
      await deleteAgent(page, agentId);
    }
  });

  test('비교표: 12개 문서로 머리표시·12행·없음 칸·엑셀 두 시트·칸 단위 저장', async ({
    page,
  }, testInfo) => {
    const uploaded = await uploadAll(page);
    const result = await runTable(page);

    await expect(result.getByTestId('task-result-scope')).toContainText('문서 12개 중 12개 반영');
    const table = await openTableInPanel(page, result);
    await expect(table.locator('tbody tr')).toHaveCount(fixture.documents.length);
    const noneCells = table.locator('tbody td').filter({ hasText: /^없음$/ });
    await expect(noneCells).toHaveCount(expectedNoneCount(TABLE_FIELDS));

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      result.getByRole('button', { name: '엑셀', exact: true }).click(),
    ]);
    const xlsxPath = testInfo.outputPath('table.xlsx');
    await download.saveAs(xlsxPath);
    const workbook = XLSX.readFile(xlsxPath);
    const tableRows = XLSX.utils.sheet_to_json(workbook.Sheets['표'], { header: 1 });
    const evidenceRows = XLSX.utils.sheet_to_json(workbook.Sheets['근거']);
    const filledCells =
      fixture.documents.length * TABLE_FIELDS.length - expectedNoneCount(TABLE_FIELDS);
    expect(tableRows.length).toBe(fixture.documents.length + 1);
    expect(evidenceRows.length).toBe(filledCells);

    const userId = await taskUserId();
    const stored = await withMongo((db) =>
      db.collection('taskextractions').countDocuments({
        user: userId,
        fileId: { $in: uploaded.map((file) => file.file_id) },
      }),
    );
    expect(stored).toBe(fixture.documents.length * TABLE_FIELDS.length);
  });

  test('항목 변경: 칩 하나를 끄고 하나를 켜면 표 열이 바뀐 항목과 같다', async ({ page }) => {
    await uploadAll(page);
    const result = await runTable(page, { off: '위험도', on: '관련 지표' });
    const table = await openTableInPanel(page, result);
    await expect(table.locator('thead th')).toHaveText([
      '문서',
      '정세 전망',
      '전월 대비',
      '관련 지표',
    ]);
  });

  test('추출 캐시: 같은 항목을 다시 요청하면 추출 호출이 0회이고 캐시 사용이 보인다', async ({
    page,
  }) => {
    await uploadAll(page);
    await runTable(page);
    expect((await modelCalls(page)).extract).toBe(fixture.documents.length);

    await page.request.post(`${TASK_MODEL_BASE}/__debug/reset`);
    const again = await runTable(page);
    await expect(again.getByTestId('task-result-scope')).toContainText('캐시 사용');
    expect((await modelCalls(page)).extract).toBe(0);
  });

  test('요약: 관점을 고르기 전엔 실행이 비활성이고, 12개 반영·한 줄 12개·모델 13회', async ({
    page,
  }) => {
    await uploadAll(page);
    await sendText(page, `E2E_TASK_SUMMARY:${uniqueLabel()}`);
    const card = planCard(page, 'summarize_documents').getByTestId('task-view-approval');
    await expect(card).toBeVisible({ timeout: 30000 });
    const run = card.getByRole('button', { name: '실행', exact: true });
    await expect(run).toBeDisabled();
    await card.getByRole('button', { name: '위험 요인 중심', exact: true }).click();
    await expect(run).toBeEnabled();
    await run.click();

    const result = resultCard(page, 'summary');
    await expect(result).toBeVisible({ timeout: RUN_COMPLETE_TIMEOUT });
    await expect(result.getByTestId('task-result-scope')).toContainText('문서 12개 중 12개 반영');
    await result.getByRole('button', { name: '요약 열기', exact: true }).click();
    const oneLines = taskPanel(page)
      .locator('h2', { hasText: '문서별 한 줄' })
      .locator('xpath=following-sibling::ul[1]/li');
    await expect(oneLines).toHaveCount(fixture.documents.length);
    const calls = await modelCalls(page);
    expect(calls.summary + calls.merge).toBe(fixture.documents.length + 1);
  });

  test('보고서: 비교표의 hwp 보고서로는 추출 호출 0회로 HWP 다운로드를 낸다', async ({
    page,
  }, testInfo) => {
    await uploadAll(page);
    const table = await runTable(page);
    await page.request.post(`${TASK_MODEL_BASE}/__debug/reset`);

    await Promise.all([
      page.waitForResponse(isAgentsStream, { timeout: 30000 }),
      table.getByRole('button', { name: 'hwp 보고서로', exact: true }).click(),
    ]);
    const report = resultCard(page, 'report');
    await expect(report).toBeVisible({ timeout: RUN_COMPLETE_TIMEOUT });
    const download = report.getByRole('button', { name: 'HWP 다운로드', exact: true });
    await expect(download).toBeVisible();
    expect((await modelCalls(page)).extract).toBe(0);

    if (!HWP_RENDER_UPSTREAM) {
      testInfo.annotations.push({
        type: '확인불가',
        description:
          '12·13: E2E_HWP_RENDER_UPSTREAM 이 없어 가짜 /render 가 만든 자리표시 파일만 받는다. 실제 hwp-mcp 주소를 주면 검사한다.',
      });
      return;
    }
    const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(file.suggestedFilename()).toMatch(/\.hwpx$/);
    const hwpxPath = testInfo.outputPath('report.hwpx');
    await file.saveAs(hwpxPath);
    const validation = execFileSync(
      'uv',
      ['run', '--no-project', '--with', 'python-hwpx==6.5.0', 'hwpx-validate', hwpxPath],
      { encoding: 'utf8' },
    );
    expect(validation).toContain('All schema validations passed.');

    const renders = (await hwpCalls(page)).render as Array<{ footnotes?: unknown[] }>;
    const footnotes = renders.at(-1)?.footnotes?.length ?? -1;
    const reread = JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          [
            'import json, re, sys, zipfile',
            'z = zipfile.ZipFile(sys.argv[1])',
            "xml = ''.join(z.read(n).decode('utf8') for n in z.namelist() if n.startswith('Contents/section'))",
            "print(json.dumps({'footnotes': len(re.findall(r'<hp:footNote\\b', xml)), 'text': re.sub(r'<[^>]+>', '', xml)}))",
          ].join('\n'),
          hwpxPath,
        ],
        { encoding: 'utf8' },
      ),
    ) as { footnotes: number; text: string };
    expect(reread.footnotes).toBe(footnotes);
    for (const doc of fixture.documents) {
      expect(reread.text).toContain(doc.filename);
    }
  });

  test('작업 패널: 세 흐름 뒤 산출물 3줄·종류 아이콘·부가 정보·단계 이름', async ({ page }) => {
    await uploadAll(page);
    await runTable(page);

    await sendText(page, `E2E_TASK_SUMMARY:${uniqueLabel()}`);
    const viewCard = planCard(page, 'summarize_documents').getByTestId('task-view-approval');
    await expect(viewCard).toBeVisible({ timeout: 30000 });
    await viewCard.getByRole('button', { name: '위험 요인 중심', exact: true }).click();
    await viewCard.getByRole('button', { name: '실행', exact: true }).click();
    await expect(resultCard(page, 'summary')).toBeVisible({ timeout: RUN_COMPLETE_TIMEOUT });

    await sendText(page, `E2E_TASK_REPORT:${uniqueLabel()}`);
    await expect(resultCard(page, 'report')).toBeVisible({ timeout: RUN_COMPLETE_TIMEOUT });

    for (const [tool, stages] of [
      ['extract_table', TABLE_STAGES],
      ['summarize_documents', SUMMARY_STAGES],
      ['write_report', REPORT_STAGES],
    ] as const) {
      const steps = planCard(page, tool).locator('ol > li');
      await expect(steps).toHaveCount(stages.length);
      for (let index = 0; index < stages.length; index++) {
        await expect(steps.nth(index)).toContainText(`${index + 1}. ${stages[index]}`);
      }
    }

    const panel = taskPanel(page);
    await expect(panel).toBeVisible();
    const back = panel.getByRole('button', { name: /돌아가기/ });
    if (await back.isVisible()) {
      await back.click();
    }
    const rows = panel.getByTestId('task-output-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('표');
    await expect(rows.nth(0)).toContainText(
      `표 · ${fixture.documents.length}행 · 값 없음 ${expectedNoneCount(TABLE_FIELDS)}`,
    );
    await expect(rows.nth(1)).toContainText('doc');
    await expect(rows.nth(1)).toContainText(/문서 · 근거 \d+개/);
    await expect(rows.nth(2)).toContainText('hwp');
    await expect(rows.nth(2)).toContainText(/문서 · 근거 \d+개/);

    const panelSteps = panel.locator('section', { hasText: '진행 상황' }).locator('ol > li');
    await expect(panelSteps).toHaveCount(REPORT_STAGES.length);
    for (let index = 0; index < REPORT_STAGES.length; index++) {
      await expect(panelSteps.nth(index)).toContainText(REPORT_STAGES[index]);
    }
  });

  test('사이드바: 항목 카드가 떠 있으면 승인 대기, 실행하면 회전 표시', async ({ page }) => {
    await uploadAll(page);
    await page.request.post(`${TASK_MODEL_BASE}/__debug/delay`, { data: { ms: 400 } });
    await sendText(page, `E2E_TASK_TABLE:${uniqueLabel()}`);
    const card = planCard(page, 'extract_table').getByTestId('task-schema-approval');
    await expect(card).toBeVisible({ timeout: 30000 });

    const rows = page.getByTestId('convo-item');
    const waitingRow = rows.filter({ hasText: '승인 대기' });
    await expect(waitingRow).toHaveCount(1);
    const title = (await waitingRow.innerText()).split('\n')[0].trim();

    await card.getByRole('button', { name: '실행', exact: true }).click();
    const runningRow = rows
      .filter({ hasText: title })
      .filter({ has: page.getByRole('img', { name: '생성 중...' }) })
      .or(rows.filter({ hasText: title }).filter({ hasText: /생성 중/ }));
    await expect(runningRow.first()).toBeVisible({ timeout: 15000 });
    await expect(rows.filter({ hasText: '승인 대기' })).toHaveCount(0);
    await expect(resultCard(page, 'table')).toBeVisible({ timeout: RUN_COMPLETE_TIMEOUT });
  });

  test('일반 대화 한글 문서: 올린 HWP 본문 첫 문단이 모델 요청에 들어가고 한글 도구 호출은 없다', async ({
    page,
  }) => {
    const [upload] = await attachFiles(page, ['sample_1.hwp']);
    expect(upload.status(), await upload.text()).toBe(200);
    const conversationId = await sendText(
      page,
      'E2E_TASK_FILE_CONTEXT:sample_1.hwp 이 문서의 핵심 내용을 세 줄로 알려줘',
    );
    await expect(
      messagesView(page).getByText('E2E task file context present: sample_1.hwp'),
    ).toBeVisible({ timeout: 30000 });
    await waitForRunToFinish(page, conversationId);

    expect((await hwpCalls(page)).extract).toEqual(['sample_1.hwp']);
    const token = await getAccessToken(page);
    const messages = await requestJson<Array<{ content?: Array<{ type?: string }> }>>(page, {
      path: `/api/messages/${encodeURIComponent(conversationId)}`,
      token,
    });
    const toolCalls = messages.flatMap((message) =>
      (message.content ?? []).filter((part) => part?.type === 'tool_call'),
    );
    expect(toolCalls).toHaveLength(0);
  });

  test('변환 서버 꺼짐 업로드: HWP 는 연결 실패 안내, 함께 올린 DOCX 는 올라간다', async ({
    page,
  }) => {
    await page.request.post(`${HWP_CONTROL_BASE}/down`);
    const responses = await attachFiles(page, ['sample_2.hwp', 'fixture.docx']);
    const byName = new Map<string, Response>();
    for (const response of responses) {
      const body = response.request().postDataBuffer()?.toString('utf8') ?? '';
      byName.set(body.includes('sample_2.hwp') ? 'hwp' : 'docx', response);
    }
    expect(byName.get('docx')?.status()).toBe(200);
    expect(byName.get('hwp')?.status()).not.toBe(200);
    await expect(page.getByText(HWP_CONNECTION_ERROR).first()).toBeVisible();
  });

  test('변환 서버 꺼짐 보고서: 본문·각주는 남고 안내가 뜨며 HWP 다운로드가 없다', async ({
    page,
  }) => {
    await uploadAll(page);
    await runTable(page);
    await page.request.post(`${HWP_CONTROL_BASE}/down`);

    await sendText(page, `E2E_TASK_REPORT:${uniqueLabel()}`);
    const report = resultCard(page, 'report');
    await expect(report).toBeVisible({ timeout: RUN_COMPLETE_TIMEOUT });
    await expect(report).toContainText('한글 문서 변환 서버에 연결하지 못');
    await expect(report).toContainText('본문은 오른쪽에서 확인하고 복사할 수 있습니다.');
    await expect(report.getByRole('button', { name: 'HWP 다운로드', exact: true })).toHaveCount(0);

    await report.getByRole('button', { name: '열기', exact: true }).click();
    const panel = taskPanel(page);
    await expect(panel.locator('h2').first()).toBeVisible();
    await expect(panel).toContainText(/근거 [1-9]\d*개/);
  });
});
