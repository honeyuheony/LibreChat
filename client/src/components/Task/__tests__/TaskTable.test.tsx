import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { TaskTableResult } from 'librechat-data-provider';
import TaskTable from '../TaskTable';

const mockDownload = jest.fn();
const mockShowToast = jest.fn();

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${JSON.stringify(options)}` : key,
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/data-provider/Tasks/queries', () => ({
  downloadTaskResultWorkbook: (...args: unknown[]) => mockDownload(...args),
}));

const makeResult = (rowCount: number): TaskTableResult => ({
  kind: 'table',
  resultId: 'r1',
  conversationId: 'c1',
  title: '분야별 비교표',
  fields: ['정세 전망', '위험도'],
  rows: Array.from({ length: rowCount }, (_, index) => ({
    file_id: `f${index}`,
    filename: `문서${index}.hwp`,
    parse: 'ok' as const,
    cells: [
      {
        value: `전망${index}`,
        status: index === 1 ? ('low' as const) : ('ok' as const),
        evidence: { quote: `인용${index}`, page: 3 },
      },
      index === 0
        ? { value: null, status: 'none' as const }
        : { value: '높음', status: 'ok' as const, evidence: { quote: '위험', paragraph: 4 } },
    ],
  })),
  stats: {
    docs: rowCount,
    reflected: rowCount,
    none: 1,
    low: 1,
    textOnly: 0,
    cached: 0,
    seconds: 30,
  },
  extractor: { promptVersion: 'v3', model: 'gpt-oss-120b' },
  createdAt: '2026-09-26T09:03:00',
});

describe('TaskTable', () => {
  it('draws a document column, the field columns, and an empty cell as 없음', () => {
    render(<TaskTable result={makeResult(2)} />);
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['com_ui_task_col_document', '정세 전망', '위험도']);

    const firstRow = screen.getAllByRole('row')[1];
    const cells = within(firstRow).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('문서0');
    expect(cells[2]).toHaveTextContent('com_ui_task_value_none');
  });

  it('numbers footnotes across filled cells in reading order with the quote and location', () => {
    render(<TaskTable result={makeResult(2)} />);
    const markers = screen.getAllByText(/^\d+$/, { selector: 'sup' });
    expect(markers.map((marker) => marker.textContent)).toEqual(['1', '2', '3']);
    expect(markers[0]).toHaveAttribute(
      'aria-label',
      '인용0 — 문서0.hwp › com_ui_task_page {"0":3}',
    );
    expect(markers[2]).toHaveAttribute(
      'aria-label',
      '위험 — 문서1.hwp › com_ui_task_paragraph {"0":4}',
    );
  });

  it('flags only low-confidence cells as needing review', () => {
    render(<TaskTable result={makeResult(3)} />);
    const flags = screen.getAllByText('com_ui_task_needs_review');
    expect(flags).toHaveLength(1);
    expect(flags[0].closest('td')).toHaveTextContent('전망1');
  });

  it('draws 40 rows first and adds 40 more when scrolled to the bottom', () => {
    render(<TaskTable result={makeResult(95)} />);
    const bodyRows = () => screen.getAllByRole('row').length - 1;
    expect(bodyRows()).toBe(41);
    expect(screen.getByText('com_ui_task_more_rows {"count":55}')).toBeInTheDocument();

    const scroller = screen.getByTestId('task-table-scroll');
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true });
    scroller.scrollTop = 600;
    fireEvent.scroll(scroller);
    expect(bodyRows()).toBe(81);
    expect(screen.getByText('com_ui_task_more_rows {"count":15}')).toBeInTheDocument();
  });

  it('shows the counts, extractor version, and time in the footer', () => {
    render(<TaskTable result={makeResult(2)} />);
    expect(screen.getByText('com_ui_task_none_count {"count":1}')).toBeInTheDocument();
    expect(screen.getByText('com_ui_task_low_count {"count":1}')).toBeInTheDocument();
    expect(screen.getByText(/com_ui_task_extract_version \{"version":"v3"\}/)).toHaveTextContent(
      '09:03',
    );
  });

  it('downloads the workbook named after the result', async () => {
    mockDownload.mockResolvedValueOnce(undefined);
    render(<TaskTable result={makeResult(1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_excel' }));
    await waitFor(() => expect(mockDownload).toHaveBeenCalledTimes(1));
    expect(mockDownload).toHaveBeenCalledWith('r1', '분야별 비교표.xlsx');
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('tells the user when the workbook download fails', async () => {
    mockDownload.mockRejectedValueOnce(new Error('404'));
    render(<TaskTable result={makeResult(1)} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_task_excel' }));
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'com_ui_task_excel_error',
        status: 'error',
      }),
    );
  });
});
