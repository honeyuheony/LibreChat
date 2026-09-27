import React from 'react';
import '@testing-library/jest-dom/extend-expect';
import { RecoilRoot } from 'recoil';
import AutoTranscribeAudioSwitch from '../AutoTranscribeAudioSwitch';
import { render, fireEvent } from 'test/layout-test-utils';
import store from '~/store';

describe('AutoTranscribeAudioSwitch', () => {
  /**
   * Mock function to set the auto-send-text state.
   */
  let mockSetAutoTranscribeAudio:
    | jest.Mock<void, [boolean]>
    | ((value: boolean) => void)
    | undefined;

  beforeEach(() => {
    mockSetAutoTranscribeAudio = jest.fn();
  });

  it('renders correctly', () => {
    const { getByTestId } = render(
      <RecoilRoot>
        <AutoTranscribeAudioSwitch />
      </RecoilRoot>,
    );

    expect(getByTestId('AutoTranscribeAudio')).toBeInTheDocument();
  });

  it('calls onCheckedChange when the switch is toggled', () => {
    /* 음성 인식을 켜야 이 스위치를 사용할 수 있다. */
    const { getByTestId } = render(
      <RecoilRoot
        initializeState={({ set }) => {
          set(store.speechToText, true);
          set(store.textToSpeech, true);
        }}
      >
        <AutoTranscribeAudioSwitch onCheckedChange={mockSetAutoTranscribeAudio} />
      </RecoilRoot>,
    );
    const switchElement = getByTestId('AutoTranscribeAudio');
    fireEvent.click(switchElement);

    expect(mockSetAutoTranscribeAudio).toHaveBeenCalledWith(true);
  });
});
