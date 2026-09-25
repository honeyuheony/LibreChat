import React from 'react';
import { QueryKeys } from 'librechat-data-provider';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConversationTitleMenu from '../ConversationTitleMenu';

let mockConversation: Record<string, unknown> | null = null;

jest.mock('~/Providers', () => ({
  useChatContext: () => ({ conversation: mockConversation }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useUpdateConversationMutation: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));

jest.mock('~/components/Conversations/ConvoOptions', () => ({
  ConvoOptions: ({ triggerLabel }: { triggerLabel?: string }) => (
    <button type="button">{triggerLabel}</button>
  ),
}));

jest.mock('~/components/Conversations/RenameForm', () => ({
  __esModule: true,
  default: () => null,
}));

function renderWithClient(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ConversationTitleMenu />
    </QueryClientProvider>,
  );
}

describe('ConversationTitleMenu', () => {
  beforeEach(() => {
    mockConversation = { conversationId: 'convo-1', title: 'New Chat' };
  });

  it('shows the title the conversation list holds once title generation writes it', () => {
    const queryClient = new QueryClient();
    renderWithClient(queryClient);
    expect(screen.getByRole('button')).toHaveTextContent('New Chat');

    act(() => {
      queryClient.setQueryData([QueryKeys.allConversations, { order: 'desc' }], {
        pages: [{ conversations: [{ conversationId: 'convo-1', title: 'Quarterly budget' }] }],
        pageParams: [null],
      });
    });

    expect(screen.getByRole('button')).toHaveTextContent('Quarterly budget');
  });

  it('ignores other conversations in the list', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([QueryKeys.allConversations], {
      pages: [{ conversations: [{ conversationId: 'convo-2', title: 'Someone else' }] }],
      pageParams: [null],
    });
    renderWithClient(queryClient);

    expect(screen.getByRole('button')).toHaveTextContent('New Chat');
  });

  it('renders nothing for a conversation that has not started', () => {
    mockConversation = { conversationId: 'new', title: 'New Chat' };
    const { container } = renderWithClient(new QueryClient());

    expect(container.firstChild).toBeNull();
  });
});
