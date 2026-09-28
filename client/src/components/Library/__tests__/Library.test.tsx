import { dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { TTaskResultListItem, TTaskResultsResponse } from 'librechat-data-provider';
import { pageTitleTopClassName } from '~/components/ui/topbar';
import Library from '../Library';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${JSON.stringify(options)}` : key,
}));

const item = (overrides: Partial<TTaskResultListItem>): TTaskResultListItem => ({
  resultId: 'r1',
  conversationId: 'c1',
  conversationTitle: '정세 비교',
  kind: 'table',
  title: '분야별 비교표',
  createdAt: new Date().toISOString(),
  ...overrides,
});

const page = (results: TTaskResultListItem[], nextCursor: string | null = null) =>
  ({ results, nextCursor }) as TTaskResultsResponse;

function ChatProbe() {
  const location = useLocation();
  return <div data-testid="chat-location">{`${location.pathname}${location.search}`}</div>;
}

function renderLibrary() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    logger: { log: () => undefined, warn: () => undefined, error: () => undefined },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/library']}>
        <Routes>
          <Route path="/library" element={<Library />} />
          <Route path="/c/:conversationId" element={<ChatProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const bodyRows = () => screen.getAllByRole('row').slice(1);
const cellTexts = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

describe('Library', () => {
  let getTaskResults: jest.SpyInstance;

  beforeEach(() => {
    getTaskResults = jest.spyOn(dataService, 'getTaskResults');
  });

  afterEach(() => {
    getTaskResults.mockRestore();
  });

  it('labels each result type and its last column', async () => {
    getTaskResults.mockResolvedValue(
      page([
        item({ resultId: 'r1', kind: 'table', title: '분야별 비교표', rows: 12 }),
        item({ resultId: 'r2', kind: 'report', title: '보고서', fileName: '정세 보고.hwpx' }),
        item({ resultId: 'r3', kind: 'summary', title: '통합 요약' }),
      ]),
    );
    renderLibrary();

    await screen.findByText('분야별 비교표 · com_ui_task_count {"0":"12"}');
    const [table, report, summary] = bodyRows().map(cellTexts);
    expect(table[1]).toBe('com_ui_library_kind_table {"0":"12"}');
    expect(table[4]).toBe('com_ui_task_excel');
    expect(report[1]).toBe('com_ui_library_kind_hwp');
    expect(report[4]).toBe('com_ui_task_copy');
    expect(summary[1]).toBe('com_ui_library_kind_doc');
    expect(summary[4]).toBe('com_ui_task_copy');
    expect(table[2]).toBe('정세 비교');
    expect(table[3]).toMatch(/^com_ui_date_today \d{2}:\d{2}$/);
    expect(screen.getByText('com_ui_library_intro {"0":"3"}')).toBeInTheDocument();
  });

  it('shows a concise table title with its row count', async () => {
    getTaskResults.mockResolvedValue(
      page([
        item({
          title:
            '비교표 · 보고서 월 · 곡물 반입량 (만 t) · 비료 반입량 (만 t) · 북중 교역액 (백만 달러) · 쌀 가격 (원/kg) · 옥수수 가격 (원/kg) · 환율 (원/달러) · 다음 달 전망',
          rows: 3,
        }),
      ]),
    );
    renderLibrary();

    expect(
      await screen.findByRole('link', { name: '비교표 · com_ui_task_count {"0":"3"}' }),
    ).toBeInTheDocument();
  });

  it('keeps only the table title prefix when its row count is missing', async () => {
    getTaskResults.mockResolvedValue(
      page([
        item({
          title: '비교표 · 보고서 월 · 곡물 반입량 (만 t) · 다음 달 전망',
        }),
      ]),
    );
    renderLibrary();

    expect(await screen.findByRole('link', { name: '비교표' })).toBeInTheDocument();
  });

  it('uses compact columns and rows for the library list', async () => {
    getTaskResults.mockResolvedValue(page([item({ rows: 12 })]));
    renderLibrary();

    const table = await screen.findByRole('table');
    const [name, type, conversation, created, action] = within(table).getAllByRole('columnheader');

    expect(table).toHaveClass('table-fixed');
    expect(name).toHaveClass('w-[38%]');
    expect(type).toHaveClass('w-[13%]', 'whitespace-nowrap');
    expect(conversation).toHaveClass('w-[27%]');
    expect(created).toHaveClass('w-[14%]');
    expect(action).toHaveClass('w-[8%]', 'whitespace-nowrap');
    expect(table.querySelector('thead')).toHaveClass('bg-surface-primary');
    [name, type, conversation, created, action].forEach((header) =>
      expect(header).toHaveClass('text-text-muted'),
    );
    expect(bodyRows()[0]).toHaveClass('h-9');
    const cells = within(bodyRows()[0]).getAllByRole('cell');
    expect(cells[1]).toHaveClass('whitespace-nowrap');
    expect(cells[4]).toHaveClass('whitespace-nowrap');
  });

  it('sets the intro in the muted theme role under a heading at the shared page-title offset', async () => {
    getTaskResults.mockResolvedValue(page([item({})]));
    renderLibrary();

    const intro = await screen.findByText('com_ui_library_intro {"0":"1"}');
    expect(intro).toHaveClass('text-[13px]', 'text-text-muted');
    expect(intro.parentElement).toHaveClass(pageTitleTopClassName);
    expect(intro.parentElement).not.toHaveClass('pt-6', 'md:pt-8');
  });

  it('sizes the page heading like the other pages, 22px bold', async () => {
    getTaskResults.mockResolvedValue(page([]));
    renderLibrary();

    const heading = await screen.findByRole('heading', { level: 1, name: 'com_ui_library' });
    expect(heading).toHaveClass('text-[22px]', 'font-bold');
    expect(heading).not.toHaveClass('text-2xl');
  });

  it('shows the empty line when there are no results', async () => {
    getTaskResults.mockResolvedValue(page([]));
    renderLibrary();
    expect(await screen.findByText('com_ui_library_empty')).toBeInTheDocument();
  });

  it('opens the conversation with the result when a row is pressed', async () => {
    getTaskResults.mockResolvedValue(page([item({ resultId: 'r 1', conversationId: 'c1' })]));
    renderLibrary();

    fireEvent.click(await screen.findByText('정세 비교'));
    expect(screen.getByTestId('chat-location')).toHaveTextContent('/c/c1?result=r%201');
  });

  it('loads the next 50 with the cursor and hides the button on the last page', async () => {
    getTaskResults
      .mockResolvedValueOnce(page([item({ resultId: 'r1', title: '첫 쪽' })], 'cursor-1'))
      .mockResolvedValueOnce(page([item({ resultId: 'r2', title: '둘째 쪽' })]));
    renderLibrary();

    fireEvent.click(await screen.findByRole('button', { name: 'com_ui_show_more' }));
    expect(await screen.findByText('둘째 쪽')).toBeInTheDocument();
    expect(getTaskResults).toHaveBeenLastCalledWith('cursor-1');
    expect(screen.getByText('첫 쪽')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'com_ui_show_more' })).not.toBeInTheDocument();
  });

  it('says the list failed and fetches again on retry', async () => {
    getTaskResults.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(page([]));
    renderLibrary();

    expect(await screen.findByText('com_ui_library_error')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));
    await waitFor(() => expect(screen.getByText('com_ui_library_empty')).toBeInTheDocument());
  });
});
