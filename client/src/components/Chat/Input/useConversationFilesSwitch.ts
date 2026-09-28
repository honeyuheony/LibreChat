import { useEffect, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { Constants, LocalStorageKeys } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { ephemeralAgentByConvoId } from '~/store';

/** 「내가 업로드한 파일」 스위치. 끈 값은 요청의 `ephemeralAgent.exclude_files` 로 서버에 간다. */
export default function useConversationFilesSwitch(conversationId?: string | null): {
  included: boolean;
  toggle: () => void;
} {
  const convoKey = conversationId ?? Constants.NEW_CONVO;
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(convoKey));
  const excluded = ephemeralAgent?.exclude_files;
  const isNewChat = convoKey === Constants.NEW_CONVO;
  const storageKey = `${LocalStorageKeys.EXCLUDE_FILES_}${convoKey}`;

  /* 대화를 다시 열면 ephemeral agent 를 새로 만들기 때문에 저장한 선택을 다시 싣는다. */
  useEffect(() => {
    if (isNewChat || excluded !== undefined || localStorage.getItem(storageKey) !== 'true') {
      return;
    }
    setEphemeralAgent((prev) => ({ ...(prev ?? {}), exclude_files: true }));
  }, [isNewChat, excluded, storageKey, setEphemeralAgent]);

  /* 다른 도구 토글처럼 이틀 뒤 만료되면 끈 선택이 모르는 사이 켜지므로, 끈 동안만 만료 없이 남긴다. */
  useEffect(() => {
    if (isNewChat || excluded === undefined) {
      return;
    }
    if (excluded) {
      localStorage.setItem(storageKey, 'true');
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [isNewChat, excluded, storageKey]);

  const toggle = useCallback(() => {
    setEphemeralAgent((prev) => ({ ...(prev ?? {}), exclude_files: prev?.exclude_files !== true }));
  }, [setEphemeralAgent]);

  return { included: excluded !== true, toggle };
}

/** 이 대화에서 사용자가 보낸 메시지에 붙은 파일 수. 같은 파일을 다시 보낸 것은 한 번만 센다. */
export function countUploadedFiles(messages: TMessage[] | undefined): number {
  const fileIds = new Set<string>();
  for (const message of messages ?? []) {
    if (message.isCreatedByUser !== true) {
      continue;
    }
    for (const file of message.files ?? []) {
      if (file.file_id != null) {
        fileIds.add(file.file_id);
      }
    }
  }
  return fileIds.size;
}
