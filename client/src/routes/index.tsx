import { SystemRoles } from 'librechat-data-provider';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import {
  Login,
  VerifyEmail,
  Registration,
  ResetPassword,
  ApiErrorWatcher,
  TwoFactorScreen,
  RequestPasswordReset,
} from '~/components/Auth';
import SkillMarketplace from '~/components/Skills/Marketplace/SkillMarketplace';
import { MarketplaceProvider } from '~/components/Agents/MarketplaceContext';
import { AuthContextProvider, useAuthContext } from '~/hooks/AuthContext';
import DeskDownload from '~/components/Connectors/DeskDownload';
import AgentMarketplace from '~/components/Agents/Marketplace';
import { OAuthSuccess, OAuthError } from '~/components/OAuth';
import DataHub from '~/components/Connectors/Hub/DataHub';
import RouteErrorBoundary from './RouteErrorBoundary';
import StartupLayout from './Layouts/Startup';
import LoginLayout from './Layouts/Login';
import dashboardRoutes from './Dashboard';
import WithRum from '~/lib/rum/WithRum';
import ShareRoute from './ShareRoute';
import ChatRoute from './ChatRoute';
import Search from './Search';
import Root from './Root';

const AuthLayout = () => (
  <AuthContextProvider>
    <WithRum>
      <Outlet />
    </WithRum>
    <ApiErrorWatcher />
  </AuthContextProvider>
);

const loadInlinePromptsView = () =>
  import('~/components/Prompts/layouts/InlinePromptsView').then((m) => ({
    Component: m.default,
  }));

const loadSkillsView = () =>
  import('~/components/Skills/layouts/SkillsView').then((m) => ({
    Component: m.default,
  }));

const loadSkillBuilder = () =>
  import('~/components/Skills/builder').then((m) => ({
    Component: m.MarketEditor,
  }));

const loadInsightsView = () =>
  import('~/components/Insights').then((m) => ({
    Component: m.default,
  }));

const loadProjectsView = () =>
  import('~/components/Projects').then((m) => ({
    Component: m.ProjectsView,
  }));

const loadProjectWorkspace = () =>
  import('~/components/Projects').then((m) => ({
    Component: m.ProjectWorkspace,
  }));

const loadLibraryView = () =>
  import('~/components/Library').then((m) => ({
    Component: m.default,
  }));

const loadSchedulesView = () =>
  import('~/components/Schedules').then((m) => ({
    Component: m.default,
  }));

const loadMetricsView = () =>
  import('~/components/Metrics/MetricsView').then((m) => ({
    Component: function AdminMetricsView() {
      const { user } = useAuthContext();
      if (user?.role !== SystemRoles.ADMIN) {
        return <Navigate to="/c/new" replace={true} />;
      }
      return <m.default />;
    },
  }));

const loadUserSettingsView = () =>
  import('~/components/UserSettings').then((m) => ({
    Component: m.default,
  }));

const baseEl = document.querySelector('base');
const baseHref = baseEl?.getAttribute('href') || '/';

export const router = createBrowserRouter(
  [
    {
      path: 'share/:shareId',
      element: <ShareRoute />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'download',
      element: <DeskDownload />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      path: 'oauth',
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'success',
          element: <OAuthSuccess />,
        },
        {
          path: 'error',
          element: <OAuthError />,
        },
      ],
    },
    {
      path: '/',
      element: <StartupLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: 'register',
          element: <Registration />,
        },
        {
          path: 'forgot-password',
          element: <RequestPasswordReset />,
        },
        {
          path: 'reset-password',
          element: <ResetPassword />,
        },
      ],
    },
    {
      path: 'verify',
      element: <VerifyEmail />,
      errorElement: <RouteErrorBoundary />,
    },
    {
      element: <AuthLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          path: '/',
          element: <LoginLayout />,
          children: [
            {
              path: 'login',
              element: <Login />,
            },
            {
              path: 'login/2fa',
              element: <TwoFactorScreen />,
            },
          ],
        },
        dashboardRoutes,
        {
          path: '/',
          element: <Root />,
          children: [
            {
              index: true,
              element: <Navigate to="/c/new" replace={true} />,
            },
            {
              path: 'c/:conversationId?',
              element: <ChatRoute />,
            },
            {
              path: 'search',
              element: <Search />,
            },
            {
              path: 'prompts',
              element: <Navigate to="/c/new" replace={true} />,
            },
            {
              /** Prompts are created from a dialog, so there is no "new" page to land on */
              path: 'prompts/new',
              element: <Navigate to="/c/new" replace={true} />,
            },
            {
              path: 'prompts/:promptId',
              lazy: loadInlinePromptsView,
            },
            {
              path: 'skills',
              lazy: loadSkillsView,
            },
            {
              path: 'insights',
              lazy: loadInsightsView,
            },
            {
              path: 'skills/new',
              lazy: loadSkillBuilder,
            },
            {
              path: 'skills/:skillId',
              lazy: loadSkillsView,
            },
            {
              path: 'skills/:skillId/edit',
              lazy: loadSkillsView,
            },
            {
              path: 'projects',
              lazy: loadProjectsView,
            },
            {
              path: 'projects/:projectId',
              lazy: loadProjectWorkspace,
            },
            {
              path: 'agents',
              element: (
                <MarketplaceProvider>
                  <AgentMarketplace />
                </MarketplaceProvider>
              ),
            },
            {
              path: 'agents/:category',
              element: (
                <MarketplaceProvider>
                  <AgentMarketplace />
                </MarketplaceProvider>
              ),
            },
            {
              path: 'connectors',
              element: <DataHub />,
            },
            {
              path: 'connectors/:serverName',
              element: <DataHub />,
            },
            {
              path: 'library',
              lazy: loadLibraryView,
            },
            {
              path: 'schedules',
              lazy: loadSchedulesView,
            },
            {
              path: 'metrics',
              lazy: loadMetricsView,
            },
            {
              path: 'settings',
              lazy: loadUserSettingsView,
            },
            {
              path: 'skills-market',
              element: (
                <MarketplaceProvider>
                  <SkillMarketplace />
                </MarketplaceProvider>
              ),
            },
            {
              path: 'skills-market/:category',
              element: (
                <MarketplaceProvider>
                  <SkillMarketplace />
                </MarketplaceProvider>
              ),
            },
          ],
        },
      ],
    },
  ],
  { basename: baseHref },
);
