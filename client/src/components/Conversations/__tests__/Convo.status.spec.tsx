import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { render, screen, act } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';

let mockActiveJobStatus: 'running' | 'requires_action' | undefined;
/** query cache의 구독을 흉내 내며, props가 같아도 상태 변경을 대화 행에 알린다. */
const mockStatusListeners = new Set<() => void>();
const mockSetStatus = (status: typeof mockActiveJobStatus) => {
  mockActiveJobStatus = status;
  mockStatusListeners.forEach((listener) => listener());
};

jest.mock('@librechat/client', () => ({
  useMediaQuery: () => false,
  useToastContext: () => ({ showToast: jest.fn() }),
  Spinner: () => <div data-testid="spinner" />,
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useNavigateToConvo: () => ({ navigateToConvo: jest.fn() }),
  useShiftKey: () => false,
}));

jest.mock('~/data-provider', () => ({
  useActiveJobStatus: () =>
    jest.requireActual<typeof import('react')>('react').useSyncExternalStore(
      (listener: () => void) => {
        mockStatusListeners.add(listener);
        return () => mockStatusListeners.delete(listener);
      },
      () => mockActiveJobStatus,
    ),
  useGetStartupConfig: () => ({ data: { sharedLinksEnabled: false } }),
  useUpdateConversationMutation: () => ({ mutateAsync: jest.fn() }),
  usePinConversationMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('react-router-dom', () => ({
  useParams: () => ({ conversationId: 'other-convo' }),
}));

jest.mock('recoil', () => ({
  useRecoilValue: () => [],
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { allConversationsSelector: 'allConversationsSelector' },
}));

jest.mock('~/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
  logger: { error: jest.fn() },
}));

jest.mock('../ConvoOptions', () => ({
  ConvoOptions: () => <div data-testid="convo-options" />,
}));

jest.mock('../ConversationEndpointIcon', () => ({
  __esModule: true,
  default: () => <div data-testid="convo-icon" />,
}));

jest.mock('../ConvoLink', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <span>{title}</span>,
}));

jest.mock('../RenameForm', () => ({
  __esModule: true,
  default: () => <form data-testid="rename-form" />,
}));

import Conversation from '../Convo';

const conversation = {
  conversationId: 'convo-1',
  title: '분기 보고서 비교',
} as TConversation;

const renderRow = (props: { isGenerating?: boolean; editActions?: boolean } = {}) =>
  render(
    <DndProvider backend={HTML5Backend}>
      <Conversation
        conversation={conversation}
        retainView={jest.fn()}
        toggleNav={jest.fn()}
        {...props}
      />
    </DndProvider>,
  );

describe('Conversation row job status', () => {
  beforeEach(() => {
    mockActiveJobStatus = undefined;
  });

  it.each([true, false])(
    'shows the approval dot instead of the spinner while paused (editActions=%s)',
    (editActions) => {
      mockActiveJobStatus = 'requires_action';
      renderRow({ isGenerating: true, editActions });

      expect(screen.getByText('com_ui_convo_awaiting_approval')).toBeInTheDocument();
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      expect(screen.queryByText('com_ui_convo_generating')).not.toBeInTheDocument();
    },
  );

  it('turns back into the spinner once the run resumes', () => {
    mockActiveJobStatus = 'requires_action';
    renderRow({ isGenerating: true });
    expect(screen.getByText('com_ui_convo_awaiting_approval')).toBeInTheDocument();

    act(() => mockSetStatus('running'));

    expect(screen.queryByText('com_ui_convo_awaiting_approval')).not.toBeInTheDocument();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('shows the running indicator instead of the approval prompt while a job runs', () => {
    mockActiveJobStatus = 'running';
    renderRow({ isGenerating: true, editActions: true });

    expect(screen.getByText('com_ui_convo_generating')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_convo_awaiting_approval')).not.toBeInTheDocument();
  });

  it('shows nothing for a status the owning list does not mark as generating', () => {
    mockActiveJobStatus = 'requires_action';
    renderRow({ isGenerating: false });

    expect(screen.queryByText('com_ui_convo_awaiting_approval')).not.toBeInTheDocument();
  });
});
