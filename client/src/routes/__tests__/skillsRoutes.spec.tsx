import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from 'react-router-dom';

jest.mock('~/components/Auth', () => ({
  Login: () => null,
  VerifyEmail: () => null,
  Registration: () => null,
  ResetPassword: () => null,
  ApiErrorWatcher: () => null,
  TwoFactorScreen: () => null,
  RequestPasswordReset: () => null,
}));

jest.mock('~/components/Agents/MarketplaceContext', () => ({
  MarketplaceProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('~/components/Agents/Marketplace', () => () => null);
jest.mock('~/components/OAuth', () => ({
  OAuthSuccess: () => null,
  OAuthError: () => null,
}));
const mockRouteUser = { current: { role: 'ADMIN' } };
const mockMetricsView = jest.fn(() => null);

jest.mock('~/hooks/AuthContext', () => ({
  AuthContextProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuthContext: () => ({ user: mockRouteUser.current }),
}));
jest.mock('~/components/Library', () => ({ __esModule: true, default: () => null }));
jest.mock('~/components/Schedules', () => ({ __esModule: true, default: () => null }));
jest.mock('~/components/UserSettings', () => ({ __esModule: true, default: () => null }));
jest.mock('~/components/Metrics/MetricsView', () => ({
  __esModule: true,
  default: mockMetricsView,
}));

jest.mock('../RouteErrorBoundary', () => () => null);
jest.mock('../Layouts/Startup', () => () => null);
jest.mock('../Layouts/Login', () => () => null);
jest.mock('../Dashboard', () => ({
  __esModule: true,
  default: { path: 'dashboard', element: null },
}));
jest.mock('../ShareRoute', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../ChatRoute', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../Search', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../Root', () => ({
  __esModule: true,
  default: () => null,
}));

import { router } from '../index';

type RouteNode = {
  path?: string;
  children?: RouteNode[];
  lazy?: () => Promise<{ Component?: React.ComponentType }>;
  hydrateFallbackElement?: React.ReactNode;
};

function flattenPaths(routes: RouteNode[]): string[] {
  return routes.flatMap((route) => [
    ...(route.path ? [route.path] : []),
    ...(route.children ? flattenPaths(route.children) : []),
  ]);
}

function findRoute(path: string, routes: RouteNode[]): RouteNode | undefined {
  for (const route of routes) {
    if (route.path === path) {
      return route;
    }
    const child = route.children ? findRoute(path, route.children) : undefined;
    if (child) {
      return child;
    }
  }
}

function findLazyRoutes(routes: RouteNode[]): RouteNode[] {
  return routes.flatMap((route) => [
    ...(route.lazy ? [route] : []),
    ...(route.children ? findLazyRoutes(route.children) : []),
  ]);
}

function RouteLocation() {
  return <span data-testid="route-location">{useLocation().pathname}</span>;
}

describe('skills routes', () => {
  it('registers the remaining screens', async () => {
    const routes = (router as unknown as { routes: RouteNode[] }).routes;
    const paths = flattenPaths(routes);

    expect(paths).toEqual(
      expect.arrayContaining(['library', 'schedules', 'operations', 'settings']),
    );
    for (const path of ['library', 'schedules', 'operations', 'settings']) {
      const route = findRoute(path, routes);
      const loadedRoute = await route?.lazy?.();
      expect(loadedRoute?.Component).toBeDefined();
    }
  });

  it('defines a hydration fallback for every lazy route', () => {
    const routes = (router as unknown as { routes: RouteNode[] }).routes;
    const lazyRoutes = findLazyRoutes(routes);

    expect(lazyRoutes.length).toBeGreaterThan(0);
    expect(lazyRoutes.every((route) => route.hydrateFallbackElement != null)).toBe(true);
  });

  it('does not warn when /library hydrates its lazy route', async () => {
    const routes = (router as unknown as { routes: RouteNode[] }).routes;
    const libraryRoute = findRoute('library', routes);
    expect(libraryRoute?.lazy).toBeDefined();
    if (!libraryRoute) {
      return;
    }

    const hydrationRouter = createMemoryRouter([{ ...libraryRoute, path: '/library' }], {
      initialEntries: ['/library'],
    });
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      render(<RouterProvider router={hydrationRouter} />);
      await waitFor(() => expect(hydrationRouter.state.initialized).toBe(true));
      expect(warning).not.toHaveBeenCalledWith(
        expect.stringContaining(
          'No `HydrateFallback` element provided to render during initial hydration',
        ),
      );
    } finally {
      warning.mockRestore();
      hydrationRouter.dispose();
    }
  });

  it('renders the metrics screen only for administrators', async () => {
    const routes = (router as unknown as { routes: RouteNode[] }).routes;
    const operationsRoute = findRoute('operations', routes);

    expect(operationsRoute?.lazy).toBeDefined();
    const loadedRoute = await operationsRoute?.lazy?.();
    const MetricsRoute = loadedRoute?.Component;

    expect(MetricsRoute).toBeDefined();
    if (!MetricsRoute) {
      return;
    }
    mockRouteUser.current = { role: 'ADMIN' };
    mockMetricsView.mockClear();
    const { unmount } = render(
      <MemoryRouter initialEntries={['/operations']}>
        <MetricsRoute />
        <RouteLocation />
      </MemoryRouter>,
    );
    expect(mockMetricsView).toHaveBeenCalled();
    unmount();

    mockRouteUser.current = { role: 'USER' };
    mockMetricsView.mockClear();
    render(
      <MemoryRouter initialEntries={['/operations']}>
        <MetricsRoute />
        <RouteLocation />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('route-location')).toHaveTextContent('/c/new');
    expect(mockMetricsView).not.toHaveBeenCalled();
  });

  it('registers the explicit /skills/new route', () => {
    const paths = flattenPaths((router as unknown as { routes: RouteNode[] }).routes);

    expect(paths).toContain('skills/new');
  });
});
