import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from 'test/layout-test-utils';
import ChatView from '../ChatView';

const mockParams = jest.fn();
const mockConversation = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockParams(),
}));

/** Auth is out of scope for heading selection; keep the shared harness wrappers. */
jest.mock('~/hooks/AuthContext', () => ({
  AuthContextProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuthContext: () => ({ isAuthenticated: false, user: null, roles: {} }),
}));

jest.mock('~/data-provider', () => ({
  useGetMessagesByConvoId: () => ({ data: null, isLoading: false, isFetching: false }),
}));

/**
 * Heading selection only needs route params + conversation state. Stub the chat
 * helper surface so the suite can inject matching vs stale IDs without standing
 * up SSE, message trees, or full ChatRoute synchronization.
 */
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => (key === 'com_ui_new_chat' ? 'New chat' : key),
  useChatHelpers: () => ({ conversation: mockConversation() }),
  useAddedResponse: () => ({}),
  useAdaptiveSSE: jest.fn(),
  useResumeOnLoad: jest.fn(),
  useQueueDrain: jest.fn(),
  useQueuedTurnReveal: jest.fn(),
  useScrollbarGutterSeed: jest.fn(),
}));

jest.mock('../Presentation', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../Header', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../Footer', () => ({
  __esModule: true,
  default: () => <div />,
  useConfiguredFooter: () => false,
}));
jest.mock('../Landing', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../Messages/MessagesView', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../Input/ChatForm', () => ({ __esModule: true, default: () => <div /> }));
jest.mock('../LandingSkills', () => ({
  __esModule: true,
  default: () => <div data-testid="landing-skills" />,
}));

describe('ChatView page heading', () => {
  beforeEach(() => {
    mockParams.mockReturnValue({});
    mockConversation.mockReturnValue(null);
  });

  test('exposes a single h1 to assistive technology', () => {
    render(<ChatView />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
  });

  test('keeps the heading visually hidden', () => {
    render(<ChatView />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('sr-only');
  });

  test('announces a localized new chat heading on the landing page', () => {
    render(<ChatView />);

    expect(screen.getByRole('heading', { level: 1, name: 'New chat' })).toBeInTheDocument();
  });

  test('uses the conversation title once a conversation is open', () => {
    mockParams.mockReturnValue({ conversationId: 'convo-1' });
    mockConversation.mockReturnValue({ conversationId: 'convo-1', title: 'Deploy checklist' });

    render(<ChatView />);

    expect(screen.getByRole('heading', { level: 1, name: 'Deploy checklist' })).toBeInTheDocument();
  });

  test('falls back to the localized heading when a title is blank', () => {
    mockParams.mockReturnValue({ conversationId: 'convo-1' });
    mockConversation.mockReturnValue({ conversationId: 'convo-1', title: '   ' });

    render(<ChatView />);

    expect(screen.getByRole('heading', { level: 1, name: 'New chat' })).toBeInTheDocument();
  });

  test('prefers the localized heading over a stale title on the landing page', () => {
    mockConversation.mockReturnValue({ conversationId: 'new', title: 'New Chat' });

    render(<ChatView />);

    expect(screen.getByRole('heading', { level: 1, name: 'New chat' })).toBeInTheDocument();
  });

  test('ignores a Recoil title that belongs to a different conversation than the route', () => {
    mockParams.mockReturnValue({ conversationId: 'convo-2' });
    mockConversation.mockReturnValue({ conversationId: 'convo-1', title: 'Previous chat' });

    render(<ChatView />);

    expect(screen.getByRole('heading', { level: 1, name: 'New chat' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'Previous chat' }),
    ).not.toBeInTheDocument();
  });
});

describe('ChatView landing suggestions', () => {
  beforeEach(() => {
    mockParams.mockReturnValue({});
    mockConversation.mockReturnValue(null);
  });

  test('shows the one-line hint instead of suggestion rows on the landing page', () => {
    render(<ChatView />);

    expect(screen.getByText(/com_ui_landing_hint|Drop documents here/)).toBeInTheDocument();
    expect(screen.queryByTestId('landing-skills')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conversation-starters')).not.toBeInTheDocument();
  });

  test('sets the hint in 13px muted text right under the composer', () => {
    render(<ChatView />);

    const hint = screen.getByText(/com_ui_landing_hint|Drop documents here/).closest('p');
    expect(hint).toHaveClass('text-[13px]', 'leading-normal', 'text-text-muted', 'pt-0', 'pb-4');
    expect(hint).not.toHaveClass('text-sm', 'pt-4', 'text-text-tertiary');
  });
});

describe('ChatView composer column', () => {
  beforeEach(() => {
    mockParams.mockReturnValue({ conversationId: 'convo-1' });
    mockConversation.mockReturnValue({ conversationId: 'convo-1', title: 'Deploy checklist' });
  });

  /* The composer's in-flight steer overlay is painted above the composer's top
     edge, so a scroll container here would clip it out of sight for the whole
     run. The gutter that lines the column up with the messages has to be
     reserved with padding instead. */
  test('reserves the message column gutter without becoming a scroll container', () => {
    const { container } = render(<ChatView />);

    const composerColumn = container.querySelector('.scrollbar-gutter-spacer');

    expect(composerColumn).not.toBeNull();
    expect(composerColumn).not.toHaveClass('overflow-y-auto');
    expect(composerColumn).not.toHaveClass('scrollbar-gutter-stable');
  });
});

describe('ChatView landing column', () => {
  beforeEach(() => {
    mockParams.mockReturnValue({});
    mockConversation.mockReturnValue(null);
  });

  /* 인사말 묶음은 높이가 0 이고 입력창 아래 여백은 안내 문구의 음수 여백과 상쇄되므로,
     입력창을 내리는 것은 세로 가운데 맞춤 영역의 위쪽 여백뿐이다. */
  test('pads the top of the centred landing column so the composer sits lower', () => {
    const { container } = render(<ChatView />);

    expect(container.querySelector('.scrollbar-gutter-spacer')).toHaveClass('sm:pt-8');
  });
});
