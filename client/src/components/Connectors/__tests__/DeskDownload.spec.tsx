import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { MemoryRouter } from 'react-router-dom';
import { dataService } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DeskAppReleaseResponse } from 'librechat-data-provider';
import DeskDownload from '../DeskDownload';

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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, cacheTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DeskDownload />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockRelease(release: DeskAppReleaseResponse) {
  jest.spyOn(dataService, 'getDeskAppRelease').mockResolvedValue(release);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DeskDownload', () => {
  it('links the installer and shows its version, size and supported OS', async () => {
    mockRelease({
      installerUrl: 'https://relay.example/app/desk-app-setup-0.1.2.exe',
      version: '0.1.2',
      sizeBytes: 111664481,
      releaseDate: '2026-09-25T12:39:37.251Z',
    });

    renderPage();

    const download = await screen.findByRole('link', { name: 'Get the app for Windows' });
    expect(download).toHaveAttribute('href', 'https://relay.example/app/desk-app-setup-0.1.2.exe');
    expect(
      screen.getByText(/^Version 0\.1\.2 · 106MB · Released .+ · Windows 10 and 11$/),
    ).toBeInTheDocument();
  });

  it('explains the SmartScreen warning before the user meets it', async () => {
    mockRelease({ installerUrl: null, version: null, sizeBytes: null, releaseDate: null });

    renderPage();

    expect(await screen.findByText(/"More info" and then "Run anyway"/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue in the browser' })).toHaveAttribute(
      'href',
      '/c/new',
    );
  });

  it('says no installer is available instead of a dead button', async () => {
    mockRelease({ installerUrl: null, version: null, sizeBytes: null, releaseDate: null });

    renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent('No installer is available');
    expect(screen.queryByRole('link', { name: 'Get the app for Windows' })).not.toBeInTheDocument();
  });

  it('says no installer is available when the release cannot be read', async () => {
    jest.spyOn(dataService, 'getDeskAppRelease').mockRejectedValue(new Error('offline'));

    renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent('No installer is available');
  });
});
