import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { act, renderHook } from '@testing-library/react';
import { LocalStorageKeys } from 'librechat-data-provider';
import useConversationFilesSwitch from '../useConversationFilesSwitch';
import { cleanupTimestampedStorage } from '~/utils/timestamps';
import { ephemeralAgentByConvoId } from '~/store';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RecoilRoot>{children}</RecoilRoot>
);

const renderSwitch = (conversationId: string) =>
  renderHook(
    () => ({
      control: useConversationFilesSwitch(conversationId),
      agent: useRecoilValue(ephemeralAgentByConvoId(conversationId)),
    }),
    { wrapper },
  );

describe('useConversationFilesSwitch', () => {
  beforeEach(() => localStorage.clear());

  it('starts with the uploaded files included', () => {
    const { result } = renderSwitch('convo-1');
    expect(result.current.control.included).toBe(true);
    expect(result.current.agent?.exclude_files).toBeUndefined();
  });

  it('marks the next request to leave the files out and remembers it for the conversation', () => {
    const { result } = renderSwitch('convo-1');
    act(() => result.current.control.toggle());
    expect(result.current.control.included).toBe(false);
    expect(result.current.agent?.exclude_files).toBe(true);
    expect(localStorage.getItem(`${LocalStorageKeys.EXCLUDE_FILES_}convo-1`)).toBe('true');
  });

  it('forgets the stored choice once the files are included again', () => {
    const { result } = renderSwitch('convo-1');
    act(() => result.current.control.toggle());
    act(() => result.current.control.toggle());
    expect(result.current.control.included).toBe(true);
    expect(localStorage.getItem(`${LocalStorageKeys.EXCLUDE_FILES_}convo-1`)).toBeNull();
  });

  it('restores the stored choice when the conversation is opened again', () => {
    localStorage.setItem(`${LocalStorageKeys.EXCLUDE_FILES_}convo-2`, 'true');
    const { result } = renderSwitch('convo-2');
    expect(result.current.control.included).toBe(false);
    expect(result.current.agent?.exclude_files).toBe(true);
  });

  it('keeps a switched-off choice through the startup cleanup of stale storage', () => {
    localStorage.setItem(`${LocalStorageKeys.EXCLUDE_FILES_}convo-3`, 'true');
    cleanupTimestampedStorage();
    const { result } = renderSwitch('convo-3');
    expect(result.current.control.included).toBe(false);
  });
});
