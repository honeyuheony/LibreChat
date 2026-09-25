import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { daypartGreetingSchedule } from '~/utils/greeting';
import temporaryStore from '~/store/temporary';
import Landing from '../Landing';

const mockUseGreeting = jest.fn();

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { name: 'Kim' } }),
  useGreeting: (...args: unknown[]) => mockUseGreeting(...args),
  useLocalize: () => (key: string) => {
    const translations: Record<string, string> = {
      com_ui_temporary: 'Temporary Chat',
      com_ui_temporary_description:
        "This chat won't appear in your history and will be deleted automatically.",
    };
    return translations[key] || key;
  },
}));

jest.mock('~/components/ui/BrandMark', () => () => <span data-testid="brand-mark" />);

function renderLanding({ isTemporary = false }: { isTemporary?: boolean } = {}) {
  return render(
    <RecoilRoot initializeState={({ set }) => set(temporaryStore.isTemporary, isTemporary)}>
      <Landing centerFormOnLanding={false} />
    </RecoilRoot>,
  );
}

describe('Landing greeting', () => {
  beforeEach(() => {
    mockUseGreeting.mockReset();
    mockUseGreeting.mockReturnValue('Good afternoon, Kim');
  });

  it('asks for the time-of-day greeting addressed to the signed-in user', () => {
    renderLanding();

    expect(mockUseGreeting).toHaveBeenCalledWith('Kim', '', daypartGreetingSchedule);
    expect(screen.getByRole('heading', { name: 'Good afternoon, Kim' })).toBeInTheDocument();
    expect(screen.getByTestId('brand-mark')).toBeInTheDocument();
  });

  it('shows no agent identity or contact, which the composer now carries', () => {
    renderLanding();

    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.queryByText('Contact:')).not.toBeInTheDocument();
  });
});

describe('Landing temporary chat empty state', () => {
  beforeEach(() => {
    mockUseGreeting.mockReset();
    mockUseGreeting.mockReturnValue('Good afternoon, Kim');
  });

  it('replaces the greeting with the temporary chat explanation', () => {
    renderLanding({ isTemporary: true });

    expect(screen.getByRole('heading', { name: 'Temporary Chat' })).toBeInTheDocument();
    expect(
      screen.getByText("This chat won't appear in your history and will be deleted automatically."),
    ).toBeInTheDocument();
    expect(screen.queryByText('Good afternoon, Kim')).not.toBeInTheDocument();
    expect(screen.queryByTestId('brand-mark')).not.toBeInTheDocument();
  });

  it('keeps the greeting and brand mark when temporary chat is off', () => {
    renderLanding();

    expect(screen.getByText('Good afternoon, Kim')).toBeInTheDocument();
    expect(screen.queryByText('Temporary Chat')).not.toBeInTheDocument();
    expect(screen.getByTestId('brand-mark')).toBeInTheDocument();
  });
});
