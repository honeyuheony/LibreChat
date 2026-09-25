import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import type { DeskAppReleaseResponse } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks';
import { useDeskAppReleaseQuery } from '~/data-provider/Connectors/queries';
import BrandMark from '~/components/ui/BrandMark';
import { useLocalize } from '~/hooks';

type Localize = ReturnType<typeof useLocalize>;

const MEBIBYTE = 1024 * 1024;

const INSTALL_STEPS: TranslationKeys[] = [
  'com_ui_desk_download_step_run',
  'com_ui_desk_download_step_smartscreen',
  'com_ui_desk_download_step_sign_in',
];

/** "0.1.2 판 · 106MB · 2026. 9. 25. 배포" with whatever latest.yml actually carried. */
export function describeRelease(release: DeskAppReleaseResponse, localize: Localize): string {
  const parts = [
    release.version ? localize('com_ui_desk_download_version', { 0: release.version }) : '',
    release.sizeBytes ? `${Math.round(release.sizeBytes / MEBIBYTE)}MB` : '',
    release.releaseDate
      ? localize('com_ui_desk_download_released', {
          0: new Date(release.releaseDate).toLocaleDateString(),
        })
      : '',
  ];
  return parts.filter(Boolean).join(' · ');
}

/**
 * Public page (no sign-in) that every "get the desktop app" entry leads to, so the
 * SmartScreen warning is explained before the user meets it.
 */
export default function DeskDownload() {
  const localize = useLocalize();
  const { data: release, isLoading } = useDeskAppReleaseQuery();

  useEffect(() => {
    document.title = localize('com_ui_desk_download_title');
  }, [localize]);

  let download: ReactNode;
  if (isLoading) {
    download = <Spinner className="size-5 text-text-secondary" />;
  } else if (release?.installerUrl) {
    download = (
      <>
        <Button asChild size="lg" shape="theme" variant="submit">
          <a href={release.installerUrl} download>
            <Download className="mr-2 size-4" aria-hidden="true" />
            {localize('com_ui_desk_download_button')}
          </a>
        </Button>
        <p className="text-sm text-text-secondary">
          {[describeRelease(release, localize), localize('com_ui_desk_download_os')]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </>
    );
  } else {
    download = (
      <p role="status" className="text-sm text-text-secondary">
        {localize('com_ui_desk_download_unavailable')}
      </p>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-primary">
      <main className="flex flex-grow items-center justify-center px-4 py-16">
        <div className="flex w-full max-w-[480px] flex-col items-center text-center">
          <BrandMark className="size-12" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-text-primary">
            {localize('com_ui_desk_download_title')}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
            {localize('com_ui_desk_download_tagline')}
          </p>
          <div className="mt-8 flex min-h-11 flex-col items-center gap-3">{download}</div>
          <section className="mt-10 w-full rounded-xl border border-border-light p-5 text-left">
            <h2 className="text-sm font-semibold text-text-primary">
              {localize('com_ui_desk_download_steps')}
            </h2>
            <ol className="mt-3 flex flex-col gap-3">
              {INSTALL_STEPS.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-relaxed text-text-secondary">
                  <span className="flex size-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-secondary text-xs font-medium text-text-primary">
                    {index + 1}
                  </span>
                  <span className="pt-0.5">{localize(step)}</span>
                </li>
              ))}
            </ol>
          </section>
          <Link
            to="/c/new"
            className="mt-6 text-sm font-medium text-accent-primary hover:text-accent-primary-hover"
          >
            {localize('com_ui_desk_download_back')}
          </Link>
        </div>
      </main>
    </div>
  );
}
