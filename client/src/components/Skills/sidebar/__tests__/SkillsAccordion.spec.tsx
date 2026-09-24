import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import SkillsAccordion from '../SkillsAccordion';

const mockSetSidebarOpen = jest.fn();

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useMediaQuery: () => true,
}));

jest.mock('~/hooks/Nav/useSidebarToggle', () => ({
  __esModule: true,
  default: () => ({ setSidebarOpen: mockSetSidebarOpen }),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: null }),
  useLocalize: () => (key: string) => key,
}));

jest.mock('../SkillsSidePanel', () => ({
  __esModule: true,
  default: () => <div data-testid="skills-side-panel" />,
}));

jest.mock('~/components/Skills/buttons', () => ({
  AdminSettings: () => null,
}));

describe('SkillsAccordion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the marketplace link and closes the mobile sidebar on navigation', () => {
    render(
      <MemoryRouter>
        <SkillsAccordion />
      </MemoryRouter>,
    );

    const marketplaceLink = screen.getByRole('link', { name: 'com_skills_marketplace' });
    expect(marketplaceLink).toHaveAttribute('href', '/skills-market');
    expect(marketplaceLink).toHaveAttribute('data-testid', 'skills-panel-marketplace-link');

    fireEvent.click(marketplaceLink);

    expect(mockSetSidebarOpen).toHaveBeenCalledWith(false);
  });
});
