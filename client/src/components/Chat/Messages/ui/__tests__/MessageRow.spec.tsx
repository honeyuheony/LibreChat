import { render, screen } from '@testing-library/react';
import MessageRow, { shouldShowAuthor } from '../MessageRow';

jest.mock('../MessageTimestamp', () => ({
  __esModule: true,
  default: ({ className }: { className?: string }) => (
    <span data-testid="message-timestamp" className={className} />
  ),
}));

const MESSAGE_BODY = 'Message body';

const renderRow = ({
  isCreatedByUser,
  hasParallelContent = false,
  fullWidth = false,
  isEditing = false,
  plain = false,
  showAuthor = false,
}: {
  isCreatedByUser: boolean;
  hasParallelContent?: boolean;
  fullWidth?: boolean;
  isEditing?: boolean;
  plain?: boolean;
  showAuthor?: boolean;
}) =>
  render(
    <MessageRow
      id="message-1"
      label={isCreatedByUser ? 'You' : 'Assistant'}
      hoverLabel={isCreatedByUser ? undefined : 'gpt-5.6'}
      icon={<span data-testid="message-icon" />}
      footer={<div data-testid="message-actions" />}
      ariaLabel={isCreatedByUser ? 'User message' : 'Assistant message'}
      headerPrefix="Message from "
      isCreatedByUser={isCreatedByUser}
      hasParallelContent={hasParallelContent}
      fullWidth={fullWidth}
      isEditing={isEditing}
      plain={plain}
      showAuthor={showAuthor}
    >
      <p>{MESSAGE_BODY}</p>
    </MessageRow>,
  );

describe('MessageRow', () => {
  it('renders a plain user row as a full-width block without header or bubble', () => {
    renderRow({ isCreatedByUser: true, plain: true });

    const row = screen.getByLabelText('User message');
    const messageSurface = screen.getByText(MESSAGE_BODY).parentElement;

    expect(row).not.toHaveClass('justify-end');
    expect(messageSurface).not.toHaveClass('bg-surface-message-user');
    expect(messageSurface).toHaveClass('w-full');
    expect(screen.queryByRole('heading', { hidden: true })).not.toBeInTheDocument();
    expect(screen.getByTestId('message-actions')).toBeInTheDocument();
  });

  it('renders user content as a right-aligned semantic surface without a visible avatar', () => {
    renderRow({ isCreatedByUser: true });

    const row = screen.getByLabelText('User message');
    const userTurn = row.querySelector('.user-turn');
    const messageSurface = screen.getByText(MESSAGE_BODY).parentElement;

    expect(row).toHaveAttribute('role', 'group');
    expect(row).toHaveClass('justify-end');
    expect(userTurn).toHaveClass('items-end');
    expect(messageSurface).toHaveClass('bg-surface-message-user', 'rounded-theme-surface');
    expect(screen.queryByTestId('message-icon')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { hidden: true })).toHaveClass('sr-only');
  });

  it('names a single-agent reply only for assistive technology', () => {
    renderRow({ isCreatedByUser: false });

    expect(screen.getByRole('heading', { name: /Assistant/ })).toHaveClass('sr-only');
    expect(screen.queryByTestId('message-icon')).not.toBeInTheDocument();
  });

  it('keeps assistant identity visible beside an open reading column', () => {
    renderRow({ isCreatedByUser: false, showAuthor: true });

    const row = screen.getByLabelText('Assistant message');

    expect(row.querySelector('.agent-turn')).toHaveClass('flex-1');
    expect(screen.getByTestId('message-icon')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Assistant/ })).toBeVisible();
  });

  it('carries the assistant avatar inside the heading without naming it', () => {
    renderRow({ isCreatedByUser: false, showAuthor: true });

    const avatar = screen.getByTestId('message-icon').parentElement;

    /** The accessible name resolves only when `aria-hidden` excludes the avatar. */
    expect(
      screen.getByRole('heading', { name: 'Message from Assistant Model: gpt-5.6' }),
    ).toContainElement(screen.getByTestId('message-icon'));
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).toHaveClass('size-4');
    expect(avatar).not.toHaveClass('md:absolute', 'md:left-0');
  });

  it('keeps the icon and provider name on the message content edge', () => {
    renderRow({ isCreatedByUser: false, showAuthor: true });

    const row = screen.getByLabelText('Assistant message');
    const agentTurn = row.querySelector('.agent-turn');

    expect(agentTurn).not.toHaveClass('md:pl-9', 'pl-9');
    expect(row).not.toHaveClass('gap-3');
    expect(row.children).toHaveLength(1);
    expect(screen.getAllByTestId('message-icon')).toHaveLength(1);
  });

  it('keeps the author line small and leaves the datetime to assistive technology', () => {
    renderRow({ isCreatedByUser: false, showAuthor: true });

    const heading = screen.getByRole('heading', { name: 'Message from Assistant Model: gpt-5.6' });

    expect(heading).toHaveClass('w-full', 'text-xs');
    expect(screen.getByTestId('message-timestamp')).toHaveClass('sr-only');
  });

  it('keeps the model name ready to replace the provider on hover', () => {
    renderRow({ isCreatedByUser: false, showAuthor: true });

    expect(screen.getByText('Assistant')).toBeVisible();
    expect(screen.getByText('gpt-5.6')).toHaveAttribute('aria-hidden', 'true');
  });

  /* The crossfade is pointer-only, so the header bar has to name the model in
     the heading itself rather than leave it behind a hover. */
  it('names the model in the heading for assistive technology', () => {
    renderRow({ isCreatedByUser: false, showAuthor: true });

    expect(
      screen.getByRole('heading', { name: 'Message from Assistant Model: gpt-5.6' }),
    ).toBeVisible();
  });

  it('preserves the assistant turn marker for parallel content', () => {
    renderRow({ isCreatedByUser: false, hasParallelContent: true });

    const row = screen.getByLabelText('Assistant message');

    expect(row.querySelector('.agent-turn')).toHaveClass('w-full');
    expect(screen.queryByTestId('message-icon')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('expands an edited user message without nesting the editor in a bubble', () => {
    renderRow({ isCreatedByUser: true, isEditing: true });

    const row = screen.getByLabelText('User message');
    const messageSurface = screen.getByTestId('message-body');

    expect(row.querySelector('.user-turn')).toHaveClass('w-full');
    expect(messageSurface).toHaveClass('w-full');
    expect(messageSurface).not.toHaveClass('bg-surface-message-user');
  });

  it('expands an edited assistant message to full width', () => {
    renderRow({ isCreatedByUser: false, isEditing: true });

    const row = screen.getByLabelText('Assistant message');
    const messageSurface = screen.getByTestId('message-body');

    expect(row.querySelector('.agent-turn')).toHaveClass('w-full');
    expect(row.querySelector('.agent-turn')).not.toHaveClass('md:pl-9');
    expect(messageSurface).toHaveClass('w-full');
  });

  it('keeps replies in the 760px reading column at every width', () => {
    renderRow({ isCreatedByUser: false });

    const row = screen.getByLabelText('Assistant message');
    expect(row).toHaveClass('sm:px-2', 'md:max-w-[48.5rem]');
    expect(row).not.toHaveClass('xl:max-w-4xl');
  });

  it('allows the maximized preference to use the full conversation width', () => {
    renderRow({ isCreatedByUser: false, fullWidth: true });

    expect(screen.getByLabelText('Assistant message')).toHaveClass('max-w-full');
  });
});

describe('shouldShowAuthor', () => {
  const conversation = { agent_id: 'agent_a', model: 'claude-sonnet' };

  it('hides the name of a reply from the conversation agent', () => {
    expect(shouldShowAuthor({ isCreatedByUser: false, model: 'agent_a' }, conversation)).toBe(
      false,
    );
  });

  it('shows the name of a reply written by another agent', () => {
    expect(shouldShowAuthor({ isCreatedByUser: false, model: 'agent_b' }, conversation)).toBe(true);
  });

  it('compares against the model when the conversation has no agent', () => {
    expect(
      shouldShowAuthor({ isCreatedByUser: false, model: 'gpt-5.6' }, { model: 'claude-sonnet' }),
    ).toBe(true);
  });

  it('never shows a name on the user turn', () => {
    expect(shouldShowAuthor({ isCreatedByUser: true, model: 'agent_b' }, conversation)).toBe(false);
  });
});
