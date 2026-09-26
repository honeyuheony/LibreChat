import React from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { TSkillSummary } from 'librechat-data-provider';
import {
  ALL_SKILLS,
  baseReport,
  myDraft,
  riskCheck,
  weekly,
  weeklyFork,
} from '../__fixtures__/skills';
import SkillMarketplace from '../SkillMarketplace';

const mockDetail = jest.fn((_props: { skill: TSkillSummary }) => null);

jest.mock('@librechat/client', () => ({
  Spinner: () => <div data-testid="spinner" />,
  useMediaQuery: () => false,
  OGDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
  useHasAccess: () => true,
  useDocumentTitle: () => undefined,
  useAuthContext: () => ({
    user: { id: jest.requireActual('../__fixtures__/skills').CURRENT_USER_ID },
  }),
}));

jest.mock('~/data-provider', () => ({
  useGetEndpointsQuery: () => ({}),
  useSkillsInfiniteQuery: () => ({
    data: { pages: [{ skills: jest.requireActual('../__fixtures__/skills').ALL_SKILLS }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
  }),
}));

jest.mock('~/components/Chat/Menus/OpenSidebar', () => () => null);
jest.mock('~/components/SidePanel', () => ({
  SidePanelGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../SkillDetailContent', () => (props: { skill: TSkillSummary }) => {
  mockDetail(props);
  return <div data-testid="detail">{props.skill.name}</div>;
});

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/skills-market', element: <SkillMarketplace /> },
      { path: '/skills-market/:category', element: <SkillMarketplace /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function rowTitles(): string[] {
  return within(screen.getByRole('tabpanel'))
    .queryAllByRole('button')
    .map((row) => row.getAttribute('aria-label') ?? '')
    .filter(Boolean);
}

describe('SkillMarketplace', () => {
  beforeEach(() => mockDetail.mockClear());

  it('ranks only agents built by staff on the popular tab, most run first', () => {
    renderAt('/skills-market');
    expect(rowTitles()).toEqual([
      weekly.displayTitle,
      riskCheck.displayTitle,
      weeklyFork.displayTitle,
      myDraft.displayTitle,
    ]);
    expect(screen.queryByLabelText(baseReport.displayTitle as string)).toBeNull();
  });

  it('sums runs and saved hours of staff-built agents in the hero', () => {
    renderAt('/skills-market');
    expect(screen.getByText('com_skills_count_unit:{"count":4}')).toBeInTheDocument();
    expect(screen.getByText('com_skills_runs_unit:{"value":"4,467"}')).toBeInTheDocument();
    expect(screen.getByText('com_skills_hours_unit:{"value":"2,463"}')).toBeInTheDocument();
  });

  it('lists every agent of a category, including base agents', () => {
    renderAt(`/skills-market/${encodeURIComponent('문서작성')}`);
    expect(rowTitles()).toEqual([
      weekly.displayTitle,
      baseReport.displayTitle,
      weeklyFork.displayTitle,
    ]);
    expect(screen.getByRole('tab', { name: 'com_skills_category_writing' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('shows only the current user skills on the mine tab', () => {
    renderAt('/skills-market/mine');
    expect(rowTitles()).toEqual([myDraft.displayTitle]);
  });

  it('switches tabs through the URL', () => {
    const router = renderAt('/skills-market');
    fireEvent.click(screen.getByRole('tab', { name: 'com_skills_category_review' }));
    expect(decodeURIComponent(router.state.location.pathname)).toBe('/skills-market/검토');
    expect(rowTitles()).toEqual([riskCheck.displayTitle, myDraft.displayTitle]);
  });

  it('opens the detail for the clicked row', () => {
    renderAt('/skills-market');
    fireEvent.click(screen.getByRole('button', { name: weekly.displayTitle }));
    expect(screen.getByTestId('detail')).toHaveTextContent(weekly.name);
    expect(mockDetail).toHaveBeenLastCalledWith(
      expect.objectContaining({ skill: weekly, allSkills: ALL_SKILLS }),
    );
  });
});
