import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaskDocResult } from 'librechat-data-provider';
import TaskDocView, { taskDocToMarkdown } from '../TaskDocView';

const mockCopy = jest.fn();
const mockShowToast = jest.fn();
const mockGetFileDownload = jest.fn();
const mockSaveBlob = jest.fn();

jest.mock(
  'copy-to-clipboard',
  () =>
    (...args: unknown[]) =>
      mockCopy(...args),
);

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key} ${JSON.stringify(options)}` : key,
  useAuthContext: () => ({ user: { id: 'u1' } }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  dataService: { getFileDownload: (...args: unknown[]) => mockGetFileDownload(...args) },
}));

jest.mock('~/data-provider/Tasks/queries', () => ({
  saveBlob: (...args: unknown[]) => mockSaveBlob(...args),
}));

const summary: TaskDocResult = {
  kind: 'summary',
  resultId: 's1',
  conversationId: 'c1',
  title: '통합 요약 · 위험 요인 중심',
  view: '위험 요인 중심',
  body: '## 전체 경향\n\n긴장이 높아졌다[^1].\n\n## 문서별 한 줄\n\n- 문서1: 요지[^2]',
  footnotes: [
    { n: 1, file_id: 'f1', filename: '문서1.pdf', evidence: { quote: '긴장 고조', page: 2 } },
    { n: 2, file_id: 'f2', filename: '문서2.hwp', evidence: { quote: '요지 문장', paragraph: 5 } },
  ],
  stats: { docs: 12, reflected: 12, none: 0, low: 0, textOnly: 0, cached: 0, seconds: 20 },
  createdAt: '2026-09-26T09:03:00',
};

const report: TaskDocResult = {
  ...summary,
  kind: 'report',
  resultId: 'p1',
  title: '부처 표준 보고서 초안.hwp',
  file: { file_id: 'hwpx1', filename: '부처 표준 보고서 초안.hwpx' },
};

describe('TaskDocView', () => {
  it('renders the markdown body with footnote markers carrying the quote and location', () => {
    render(<TaskDocView result={summary} />);
    expect(screen.getByRole('heading', { name: '전체 경향' })).toBeInTheDocument();
    const markers = screen.getAllByText(/^\d+$/, { selector: 'sup' });
    expect(markers.map((marker) => marker.textContent)).toEqual(['1', '2']);
    expect(markers[0]).toHaveAttribute(
      'aria-label',
      '긴장 고조 — 문서1.pdf › com_ui_task_page {"0":2}',
    );
    expect(screen.queryByText('[^1]', { exact: false })).not.toBeInTheDocument();
  });

  it('shows the evidence count and time in the footer', () => {
    render(<TaskDocView result={summary} />);
    expect(screen.getByText('com_ui_task_evidence_count {"count":12}')).toBeInTheDocument();
    expect(screen.getByText('09:03')).toBeInTheDocument();
  });

  it('copies the body with the footnotes appended as markdown', () => {
    render(<TaskDocView result={summary} />);
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_copy' }));
    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(mockCopy.mock.calls[0][0]).toBe(
      `${summary.body}\n\n[^1]: 문서1.pdf (p.2) — "긴장 고조"\n[^2]: 문서2.hwp (¶5) — "요지 문장"`,
    );
  });

  it('offers HWP only for a report that has a file', () => {
    const { rerender } = render(<TaskDocView result={summary} />);
    expect(screen.queryByRole('button', { name: 'HWP' })).not.toBeInTheDocument();
    rerender(<TaskDocView result={{ ...report, file: undefined }} />);
    expect(screen.queryByRole('button', { name: 'HWP' })).not.toBeInTheDocument();
    rerender(<TaskDocView result={report} />);
    expect(screen.getByRole('button', { name: 'HWP' })).toBeInTheDocument();
  });

  it('downloads the report file under its own name', async () => {
    const blob = new Blob(['x']);
    mockGetFileDownload.mockResolvedValueOnce({ data: blob });
    render(<TaskDocView result={report} />);
    fireEvent.click(screen.getByRole('button', { name: 'HWP' }));
    await waitFor(() => expect(mockSaveBlob).toHaveBeenCalledTimes(1));
    expect(mockGetFileDownload).toHaveBeenCalledWith('u1', 'hwpx1');
    expect(mockSaveBlob).toHaveBeenCalledWith(blob, '부처 표준 보고서 초안.hwpx');
  });
});

describe('taskDocToMarkdown', () => {
  it('returns the body alone when there are no footnotes', () => {
    expect(taskDocToMarkdown({ ...summary, footnotes: [] })).toBe(summary.body);
  });
});
