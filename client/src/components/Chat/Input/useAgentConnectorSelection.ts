import { useMemo, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { useRecoilState } from 'recoil';
import {
  Constants,
  LocalStorageKeys,
  splitMCPToolKey,
  normalizeServerName,
} from 'librechat-data-provider';
import {
  ephemeralAgentByConvoId,
  newChatExtraConnectorAtom,
  NEW_CHAT_EXTRA_CONNECTOR_TTL_MS,
} from '~/store';
import { getTimestampedValue, setTimestampedValue } from '~/utils/timestamps';
import useAgentToolPermissions from '~/hooks/Agents/useAgentToolPermissions';
import { isEphemeralAgent } from '~/common';

export interface AgentConnectorSelection {
  /** 서버가 도구 접근을 제한하는 saved agent 대화인지 나타낸다. */
  isSavedAgent: boolean;
  agentServerNames: ReadonlySet<string>;
  isEnabled: (serverName: string) => boolean;
  toggle: (serverName: string) => void;
}

function readStoredDisabled(storageKey: string): string[] | undefined {
  const raw = getTimestampedValue(storageKey);
  if (raw == null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((name): name is string => typeof name === 'string')
      : undefined;
  } catch {
    // 저장값을 읽지 못하면 호출부가 새 대화 기본값을 적용한다.
    return undefined;
  }
}

export function getAgentServerNames(
  tools: readonly string[] | undefined,
  catalogServerNames: readonly string[],
): Set<string> {
  const names = new Set<string>();
  if (!tools?.length) {
    return names;
  }
  const byToolKeyName = new Map<string, string>();
  for (const name of catalogServerNames) {
    byToolKeyName.set(name, name);
    byToolKeyName.set(normalizeServerName(name), name);
  }
  const knownNames = [...byToolKeyName.keys()];
  for (const tool of tools) {
    if (typeof tool !== 'string' || !tool.includes(Constants.mcp_delimiter)) {
      continue;
    }
    const [, serverName] = splitMCPToolKey(tool, knownNames);
    const catalogName = serverName != null ? byToolKeyName.get(serverName) : undefined;
    if (catalogName != null) {
      names.add(catalogName);
    }
  }
  return names;
}

/** 저장된 선택이 없는 saved agent 대화는 새 대화의 connector 기본값으로 시작한다. */
export default function useAgentConnectorSelection({
  conversationId,
  agentId,
  catalogServerNames,
  newChatOff,
}: {
  conversationId?: string | null;
  agentId?: string | null;
  catalogServerNames: readonly string[];
  /** 새 대화에서 기본으로 끌 connector이며, 사용자 설정과 목록을 불러오기 전에는 undefined다. */
  newChatOff?: readonly string[];
}): AgentConnectorSelection {
  const convoKey = conversationId ?? Constants.NEW_CONVO;
  const isSavedAgent = agentId != null && agentId !== '' && !isEphemeralAgent(agentId);
  const [ephemeralAgent, setEphemeralAgent] = useRecoilState(ephemeralAgentByConvoId(convoKey));
  const { tools } = useAgentToolPermissions(isSavedAgent ? agentId : null, ephemeralAgent);

  const agentServerNames = useMemo(
    () => (isSavedAgent ? getAgentServerNames(tools, catalogServerNames) : new Set<string>()),
    [isSavedAgent, tools, catalogServerNames],
  );

  const storageKey = `${LocalStorageKeys.LAST_MCP_DISABLED_}${convoKey}`;
  const disabledList = ephemeralAgent?.disabled_mcp;
  const isNewChat = convoKey === Constants.NEW_CONVO;

  const [extraOn, setExtraOn] = useAtom(newChatExtraConnectorAtom);

  /* 새 대화마다 ephemeral agent가 새로 생기므로 connector 기본값을 매번 다시 적용한다. */
  useEffect(() => {
    if (!isSavedAgent || !isNewChat || disabledList !== undefined || newChatOff === undefined) {
      return;
    }
    const extra =
      extraOn != null && Date.now() - extraOn.at < NEW_CHAT_EXTRA_CONNECTOR_TTL_MS
        ? extraOn.serverName
        : undefined;
    setEphemeralAgent((prev) =>
      prev?.disabled_mcp !== undefined
        ? prev
        : { ...(prev ?? {}), disabled_mcp: newChatOff.filter((name) => name !== extra) },
    );
  }, [isSavedAgent, isNewChat, disabledList, newChatOff, extraOn, setEphemeralAgent]);

  useEffect(() => {
    if (!isNewChat && extraOn != null) {
      setExtraOn(null);
    }
  }, [isNewChat, extraOn, setExtraOn]);

  /* 대화를 다시 열면 model spec으로 ephemeral agent를 만들기 때문에 저장한 선택을 다시 적용한다. */
  useEffect(() => {
    if (!isSavedAgent || isNewChat || disabledList !== undefined) {
      return;
    }
    const stored = readStoredDisabled(storageKey) ?? newChatOff;
    if (stored !== undefined) {
      setEphemeralAgent((prev) => ({ ...(prev ?? {}), disabled_mcp: [...stored] }));
    }
  }, [isSavedAgent, isNewChat, disabledList, storageKey, newChatOff, setEphemeralAgent]);

  /* timestamp를 붙여 실제 대화 ID에 저장하면 앱 시작 시 정리 작업에서 값을 지우지 않는다. */
  useEffect(() => {
    if (isNewChat || !Array.isArray(disabledList)) {
      return;
    }
    setTimestampedValue(storageKey, disabledList);
  }, [isNewChat, disabledList, storageKey]);

  /* 선택을 반영하기 전에는 기본값을 읽어 칩이 잠깐 모두 켜져 보이지 않게 한다. */
  const disabled = useMemo(
    () => new Set(disabledList ?? newChatOff ?? []),
    [disabledList, newChatOff],
  );

  const isEnabled = useCallback(
    (serverName: string) => agentServerNames.has(serverName) && !disabled.has(serverName),
    [agentServerNames, disabled],
  );

  const toggle = useCallback(
    (serverName: string) => {
      if (!agentServerNames.has(serverName)) {
        return;
      }
      setEphemeralAgent((prev) => {
        const current = new Set(prev?.disabled_mcp ?? newChatOff ?? []);
        if (current.has(serverName)) {
          current.delete(serverName);
        } else {
          current.add(serverName);
        }
        return { ...(prev ?? {}), disabled_mcp: [...current] };
      });
    },
    [agentServerNames, newChatOff, setEphemeralAgent],
  );

  return { isSavedAgent, agentServerNames, isEnabled, toggle };
}
