import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { RecoilRoot } from 'recoil';
import ConversationModeSwitch from './ConversationModeSwitch';
import { render, fireEvent } from 'test/layout-test-utils';
import store from '~/store';

describe('ConversationModeSwitch', () => {
  /**
   * Mock function to set the auto-send-text state.
   */
  let mockSetConversationMode: jest.Mock<void, [boolean]> | ((value: boolean) => void) | undefined;

  beforeEach(() => {
    mockSetConversationMode = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <ConversationModeSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('ConversationMode')).toBeInTheDocument();
  });

  it('calls onCheckedChange when the switch is toggled', () => {
    /* Speech to text starts off, and this switch only works once it is on. */
    const { getByTestId } = render(
      <RecoilRoot
        initializeState={({ set }) => {
          set(store.speechToText, true);
          set(store.textToSpeech, true);
        }}
      >
        <ConversationModeSwitch onCheckedChange={mockSetConversationMode} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('ConversationMode');
    fireEvent.click(switchElement);

    expect(mockSetConversationMode).toHaveBeenCalledWith(true);
  });
});
