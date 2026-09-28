import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import UnifiedSidebar from '../UnifiedSidebar';
import { EXPANDED_MIN } from '../constants';

jest.mock('@librechat/client', () => ({
  useMediaQuery: () => false,
}));

jest.mock('~/hooks/Nav/useSidebarState', () => ({
  __esModule: true,
  default: () => ({ isSmallScreen: false, expanded: true }),
}));

jest.mock('~/hooks/Nav/useSidebarToggle', () => ({
  __esModule: true,
  default: () => ({ setSidebarOpen: jest.fn() }),
}));

jest.mock('~/hooks/Nav/useUnifiedSidebarLinks', () => ({
  __esModule: true,
  default: () => [],
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useChatHelpers: () => ({}),
}));

jest.mock('~/components/Nav/Settings/Host', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('~/components/SidePanel/Nav', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../ExpandedPanel', () => ({
  __esModule: true,
  default: () => null,
}));

function renderDesktop() {
  return render(
    <MemoryRouter initialEntries={['/c/new']}>
      <UnifiedSidebar />
    </MemoryRouter>,
  );
}

describe('UnifiedSidebar width', () => {
  afterEach(() => localStorage.clear());

  it('keeps the expanded width fixed even when an old saved width exists', () => {
    localStorage.setItem('side:width', '400');
    renderDesktop();
    expect(screen.getByRole('complementary')).toHaveStyle({ width: `${EXPANDED_MIN}px` });
  });

  it('renders no resize handle', () => {
    renderDesktop();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });
});
