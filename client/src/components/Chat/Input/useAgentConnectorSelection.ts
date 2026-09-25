import { useMemo, useEffect, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import {
  Constants,
  LocalStorageKeys,
  splitMCPToolKey,
  normalizeServerName,
} from 'librechat-data-provider';
import useAgentToolPermissions from '~/hooks/Agents/useAgentToolPermissions';
import { ephemeralAgentByConvoId } from '~/store';
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
  const raw = localStorage.getItem(storageKey);
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
 * The chat's connector switches for a saved agent. Every connector the agent
 * carries starts on; switching one off records it in `ephemeralAgent.disabled_mcp`,
 * which the server uses to leave that connector's tools out of the run.
 */
export default function useAgentConnectorSelection({
  conversationId,
  agentId,
  catalogServerNames,
}: {
  conversationId?: string | null;
  agentId?: string | null;
  catalogServerNames: readonly string[];
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

  /* A conversation loaded again rebuilds its ephemeral agent from the model spec,
     which knows nothing of these switches, so the stored choice is laid back on. */
  useEffect(() => {
    if (!isSavedAgent || convoKey === Constants.NEW_CONVO || disabledList !== undefined) {
      return;
    }
    const stored = readStoredDisabled(storageKey);
    if (stored !== undefined) {
      setEphemeralAgent((prev) => ({ ...(prev ?? {}), disabled_mcp: stored }));
    }
  }, [isSavedAgent, convoKey, disabledList, storageKey, setEphemeralAgent]);

  /* A new chat's choice moves to its real id with the ephemeral agent, and is stored from there. */
  useEffect(() => {
    if (convoKey === Constants.NEW_CONVO || !Array.isArray(disabledList)) {
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(disabledList));
  }, [convoKey, disabledList, storageKey]);

  const disabled = useMemo(() => new Set(disabledList ?? []), [disabledList]);

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
        const current = new Set(prev?.disabled_mcp ?? []);
        if (current.has(serverName)) {
          current.delete(serverName);
        } else {
          current.add(serverName);
        }
        return { ...(prev ?? {}), disabled_mcp: [...current] };
      });
    },
    [agentServerNames, setEphemeralAgent],
  );

  return { isSavedAgent, agentServerNames, isEnabled, toggle };
}
