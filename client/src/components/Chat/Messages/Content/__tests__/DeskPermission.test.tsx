import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import userEvent from '@testing-library/user-event';
import { dataService } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DeskPermission } from 'librechat-data-provider';
import DeskPermissionPrompt from '../DeskPermission';

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('~/hooks', () => {
  const english = jest.requireActual<Record<string, string>>('~/locales/en/translation.json');
  const localize = (key: string, params?: Record<string, string>) =>
    Object.entries(params ?? {}).reduce(
      (text, [name, value]) => text.replace(`{{${name}}}`, value),
      english[key] ?? key,
    );
  return { useLocalize: () => localize };
});

const WAITING: DeskPermission = {
  requestId: 7,
  path: 'D:\\보고서\\1분기.hwp',
  localPort: 50123,
  approveToken: 'token-1',
  expiresAt: '2099-01-01T00:00:00+00:00',
};

const fetchMock = jest.fn();

function renderPrompt(permissions: DeskPermission[]) {
  jest.spyOn(dataService, 'getDeskPermissions').mockResolvedValue(permissions);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DeskPermissionPrompt />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DeskPermissionPrompt', () => {
  it('shows nothing while the PC is not waiting for an answer', async () => {
    const { container } = renderPrompt([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers the three answers on the PC that asked and sends the chosen one to the app', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ state: 'waiting' }) });
    renderPrompt([WAITING]);

    expect(await screen.findByText('Waiting for permission on the PC')).toBeInTheDocument();
    expect(screen.getByText('D:\\보고서\\1분기.hwp')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Allow once' }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:50123/permissions/7?token=token-1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:50123/permissions/7',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'token-1', decision: 'once' }),
      }),
    );
    expect(await screen.findByText('Answer sent to the PC.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow once' })).not.toBeInTheDocument();
  });

  it('shows no buttons on another PC, where the app cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderPrompt([WAITING]);

    expect(await screen.findByText('Only the PC that asked can allow this.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows no buttons when the app on this PC does not know the request', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    renderPrompt([WAITING]);

    expect(await screen.findByText('Only the PC that asked can allow this.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says so when the app refuses the answer', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: 'waiting' }) })
      .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) });
    renderPrompt([WAITING]);

    await userEvent.click(await screen.findByRole('button', { name: 'Deny' }));
    expect(
      await screen.findByText(
        'Could not send the answer to the desktop app. Answer in the app window on the PC.',
      ),
    ).toBeInTheDocument();
  });
});
