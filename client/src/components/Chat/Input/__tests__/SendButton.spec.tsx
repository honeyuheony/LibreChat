import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SendButton from '../SendButton';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
}));

function Composer({
  text,
  disabled = false,
  onSubmit,
}: {
  text: string;
  disabled?: boolean;
  onSubmit: () => void;
}) {
  const methods = useForm<{ text: string }>({ defaultValues: { text } });
  useEffect(() => {
    methods.setValue('text', text);
  }, [methods, text]);
  return (
    <form onSubmit={methods.handleSubmit(onSubmit)}>
      <SendButton control={methods.control} disabled={disabled} />
    </form>
  );
}

const sendButton = () => screen.getByTestId('send-button');

describe('SendButton', () => {
  it('marks an empty composer send button unavailable without disabling it', () => {
    render(<Composer text="" onSubmit={jest.fn()} />);

    expect(sendButton()).not.toHaveAttribute('disabled');
    expect(sendButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not submit an empty composer when clicked', async () => {
    const onSubmit = jest.fn();
    const onNativeSubmit = jest.fn();
    render(<Composer text="" onSubmit={onSubmit} />);
    sendButton().closest('form')?.addEventListener('submit', onNativeSubmit);

    fireEvent.click(sendButton());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onNativeSubmit).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits once there is text', async () => {
    const onSubmit = jest.fn();
    render(<Composer text="hello" onSubmit={onSubmit} />);

    expect(sendButton()).not.toHaveAttribute('aria-disabled');
    fireEvent.click(sendButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('stays disabled while the composer is busy', () => {
    render(<Composer text="hello" disabled onSubmit={jest.fn()} />);

    expect(sendButton()).toBeDisabled();
  });
});
