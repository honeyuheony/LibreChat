import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { daypartGreetingSchedule } from '~/utils/greeting';
import Landing, { greetingName } from '../Landing';
import temporaryStore from '~/store/temporary';

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

function renderLanding({
  isTemporary = false,
  centered = false,
}: { isTemporary?: boolean; centered?: boolean } = {}) {
  return render(
    <RecoilRoot initializeState={({ set }) => set(temporaryStore.isTemporary, isTemporary)}>
      <Landing centerFormOnLanding={centered} />
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

  /* 가운데 놓인 홈에서는 인사말 묶음의 높이가 아래 여백뿐이라, 그 여백이 인사말 가운데와
     입력창 윗변 사이 거리가 된다. */
  it('keeps a 44px band between the greeting and the centred composer', () => {
    const { container } = renderLanding({ centered: true });

    expect(container.firstElementChild).toHaveClass('sm:max-h-0', 'sm:pb-11');
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

describe('greetingName', () => {
  it('greets a Korean full name by its given name', () => {
    expect(greetingName('홍길동')).toBe('길동');
  });

  it('keeps any other name whole', () => {
    expect(greetingName('Kim')).toBe('Kim');
    expect(greetingName('admin')).toBe('admin');
  });
});
