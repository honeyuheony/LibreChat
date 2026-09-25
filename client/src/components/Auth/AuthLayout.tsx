import { ThemeSelector } from '@librechat/client';
import { TStartupConfig } from 'librechat-data-provider';
import { ErrorMessage } from '~/components/Auth/ErrorMessage';
import { TranslationKeys, useLocalize } from '~/hooks';
import SocialLoginRender from './SocialLoginRender';
import { BlinkAnimation } from './BlinkAnimation';
import BrandMark from '~/components/ui/BrandMark';
import { Banner } from '../Banners';
import Footer from './Footer';

function AuthLayout({
  children,
  header,
  isFetching,
  startupConfig,
  startupConfigError,
  pathname,
  error,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
  isFetching: boolean;
  startupConfig: TStartupConfig | null | undefined;
  startupConfigError: unknown | null | undefined;
  pathname: string;
  error: TranslationKeys | null;
}) {
  const localize = useLocalize();

  const hasStartupConfigError = startupConfigError !== null && startupConfigError !== undefined;
  const DisplayError = () => {
    if (hasStartupConfigError) {
      return (
        <div className="mb-4">
          <ErrorMessage>{localize('com_auth_error_login_server')}</ErrorMessage>
        </div>
      );
    } else if (error === 'com_auth_error_invalid_reset_token') {
      return (
        <div className="mb-4">
          <ErrorMessage>
            {localize('com_auth_error_invalid_reset_token')}{' '}
            <a
              className="font-semibold text-accent-primary hover:underline"
              href="/forgot-password"
            >
              {localize('com_auth_click_here')}
            </a>{' '}
            {localize('com_auth_to_try_again')}
          </ErrorMessage>
        </div>
      );
    } else if (error != null && error) {
      return (
        <div className="mb-4">
          <ErrorMessage>{localize(error)}</ErrorMessage>
        </div>
      );
    }
    return null;
  };

  const showHeader = !hasStartupConfigError && !isFetching && header;
  const isLoginPage = pathname === '/login';

  return (
    <div className="relative flex min-h-screen flex-col bg-surface-primary">
      <Banner />
      <div className="absolute bottom-0 left-0 md:m-4">
        <ThemeSelector />
      </div>
      <main className="flex flex-grow items-center justify-center px-4 py-16">
        <div className="flex w-full max-w-[400px] flex-col">
          <BlinkAnimation active={isFetching}>
            <div className="flex justify-center">
              <BrandMark className="size-12" />
              <span className="sr-only">
                {localize('com_ui_logo', { 0: startupConfig?.appTitle ?? '업무 에이전트 플랫폼' })}
              </span>
            </div>
          </BlinkAnimation>
          <div className="mb-4 mt-6 flex min-h-4 flex-col items-center gap-2 text-center">
            {showHeader && (
              <>
                <h1
                  className="text-2xl font-semibold tracking-tight text-text-primary"
                  style={{ userSelect: 'none' }}
                >
                  {header}
                </h1>
                {isLoginPage && (
                  <p className="text-[15px] text-text-secondary">{localize('com_auth_tagline')}</p>
                )}
              </>
            )}
          </div>
          <DisplayError />
          {children}
          {!pathname.includes('2fa') &&
            (pathname.includes('login') || pathname.includes('register')) && (
              <SocialLoginRender startupConfig={startupConfig} />
            )}
        </div>
      </main>
      <Footer startupConfig={startupConfig} />
    </div>
  );
}

export default AuthLayout;
