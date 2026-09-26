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
  /** True when the conversation runs a saved agent, whose tools the server narrows. */
  isSavedAgent: boolean;
  /** Connectors the saved agent carries; only these can be switched. */
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
    // A corrupt entry reads as "nothing chosen": every connector the agent carries stays on.
    return undefined;
  }
}

/** The connectors a saved agent carries, read from its MCP tool keys. */
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

/**
 * The chat's connector switches for a saved agent. A new chat starts with the connectors
 * the user keeps on for new chats (`newChatOff` lists the rest); switching one off records
 * it in `ephemeralAgent.disabled_mcp`, which the server uses to leave that connector's tools
 * out of the run. A switch changes only its own conversation. A conversation opened with no
 * stored choice (another browser, or one older than the storage keeps) starts from the same
 * new-chat defaults rather than with every connector on.
 */
export default function useAgentConnectorSelection({
  conversationId,
  agentId,
  catalogServerNames,
  newChatOff,
}: {
  conversationId?: string | null;
  agentId?: string | null;
  catalogServerNames: readonly string[];
  /** Connectors a new chat starts with off; undefined until the user and catalog load. */
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

  /* Every new chat gets a fresh ephemeral agent, so the new-chat defaults are laid on each
     time; the chat's own switches then take over and move with it to its real id. */
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

  /* A conversation loaded again rebuilds its ephemeral agent from the model spec,
     which knows nothing of these switches, so the stored choice is laid back on. */
  useEffect(() => {
    if (!isSavedAgent || isNewChat || disabledList !== undefined) {
      return;
    }
    const stored = readStoredDisabled(storageKey) ?? newChatOff;
    if (stored !== undefined) {
      setEphemeralAgent((prev) => ({ ...(prev ?? {}), disabled_mcp: [...stored] }));
    }
  }, [isSavedAgent, isNewChat, disabledList, storageKey, newChatOff, setEphemeralAgent]);

  /* A new chat's choice moves to its real id with the ephemeral agent, and is stored from there.
     The timestamp keeps app startup's cleanup, which drops `LAST_MCP_*` keys without one,
     from deleting it on the next load. */
  useEffect(() => {
    if (isNewChat || !Array.isArray(disabledList)) {
      return;
    }
    setTimestampedValue(storageKey, disabledList);
  }, [isNewChat, disabledList, storageKey]);

  /* Until a choice is laid on, read the defaults directly so the chips never flash all on. */
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
