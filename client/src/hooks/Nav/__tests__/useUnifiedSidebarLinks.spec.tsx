import React from 'react';
import { RecoilRoot } from 'recoil';
import { Sparkles } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { renderHook } from '@testing-library/react';
import type { NavLink } from '~/common';
import useUnifiedSidebarLinks from '../useUnifiedSidebarLinks';

const mockNavigate = jest.fn();
const mockSideNavLinks: { current: NavLink[] } = { current: [] };
const mockCategories: { current: Array<{ value: string; count: number }> | undefined } = {
  current: undefined,
};
const mockPendingConnectors = { current: 0 };

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('librechat-data-provider/react-query', () => ({
  useUserKeyQuery: () => ({ data: {} }),
}));
jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: { interface: {} } }),
  useGetEndpointsQuery: () => ({ data: {} }),
  useInsightsAccessQuery: () => ({ data: undefined, isLoading: false }),
  useSkillCategoriesQuery: () => ({
    data: mockCategories.current ? { categories: mockCategories.current } : undefined,
  }),
}));
jest.mock('~/hooks/Nav/useSideNavLinks', () => () => mockSideNavLinks.current);
jest.mock('~/hooks/Nav/usePendingConnectorCount', () => () => mockPendingConnectors.current);
jest.mock('~/hooks', () => ({ useAuthContext: () => ({ user: { id: 'user-a' } }) }));
jest.mock('~/components/UnifiedSidebar/ConversationsSection', () => () => null);

const skillsPanel: NavLink = { title: 'com_ui_skills', icon: Sparkles, id: 'skills' };

function renderLinks() {
  const { result } = renderHook(() => useUnifiedSidebarLinks(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <RecoilRoot>
        <MemoryRouter>{children}</MemoryRouter>
      </RecoilRoot>
    ),
  });
  return result.current;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSideNavLinks.current = [skillsPanel];
  mockCategories.current = [
    { value: 'hr', count: 3 },
    { value: 'finance', count: 4 },
  ];
  mockPendingConnectors.current = 0;
});

describe('useUnifiedSidebarLinks', () => {
  it('orders the rows as history, market, then data hub, leaving the old agent panel out', () => {
    expect(renderLinks().map((link) => link.id)).toEqual([
      'conversations',
      'skills-market',
      'connectors',
    ]);
  });

  it('marks the rows with the wireframe glyphs', () => {
    const links = renderLinks();
    expect(links.find((link) => link.id === 'skills-market')?.glyph).toBe('/');
    expect(links.find((link) => link.id === 'connectors')?.glyph).toBe('⇄');
  });

  it('badges the data hub with the connectors waiting to be connected', () => {
    mockPendingConnectors.current = 2;
    expect(renderLinks().find((link) => link.id === 'connectors')?.badge).toBe(2);
  });

  it('counts the market as the sum of its categories', () => {
    const market = renderLinks().find((link) => link.id === 'skills-market');
    expect(market?.trailing).toBe('7');
  });

  it('opens the market and the data hub as pages', () => {
    const links = renderLinks();
    links.find((link) => link.id === 'skills-market')?.onClick?.();
    links.find((link) => link.id === 'connectors')?.onClick?.();
    expect(mockNavigate.mock.calls).toEqual([['/skills-market'], ['/connectors']]);
  });

  it('leaves the market out when agents are unavailable', () => {
    mockSideNavLinks.current = [];
    expect(renderLinks().map((link) => link.id)).toEqual(['conversations', 'connectors']);
  });
});
