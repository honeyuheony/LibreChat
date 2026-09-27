import { useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useRecoilValue } from 'recoil';
import type { TMessage, MCPServersListResponse } from 'librechat-data-provider';
import { getAgentServerNames } from '~/components/Chat/Input/useAgentConnectorSelection';
import useAgentToolPermissions from '~/hooks/Agents/useAgentToolPermissions';
import { MyFilesModal } from '~/components/Chat/Input/Files/MyFilesModal';
import { ContextRow, HeadingLink, Section, SubHeading } from './Section';
import { ephemeralAgentByConvoId } from '~/store/agents';
import { collectConversationFiles } from './taskState';
import { mcpValuesAtomFamily } from '~/store/mcp';
import { isEphemeralAgent } from '~/common';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function ContextSection({
  conversationId,
  messages,
  servers,
  isTaskMode,
  open,
  onToggle,
}: {
  conversationId: string;
  messages: TMessage[] | undefined;
  servers: MCPServersListResponse | undefined;
  isTaskMode: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const localize = useLocalize();
  const [filesOpen, setFilesOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const manageRef = useRef<HTMLDivElement>(null);
  const files = useMemo(() => collectConversationFiles(messages), [messages]);
  const chatSelection = useAtomValue(mcpValuesAtomFamily(conversationId));
  const ephemeralAgent = useRecoilValue(ephemeralAgentByConvoId(conversationId));
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const agentId = conversation?.agent_id;
  const isSavedAgent = agentId != null && agentId !== '' && !isEphemeralAgent(agentId);
  const { tools, agent } = useAgentToolPermissions(isSavedAgent ? agentId : null, ephemeralAgent);
  const modelName = agent?.model ?? conversation?.model ?? '';

  /**
   * 입력창과 같은 규칙: 저장된 agent 면 그 agent 의 MCP 서버에서 이 대화에서 끈 것을 빼고,
   * 아니면 대화 메뉴의 서버와 이 대화에서 고른 값을 쓴다. 목록 응답은 서버 이름이 키라 값에 이름이 없다.
   */
  const serverRows = useMemo(() => {
    const catalog = Object.entries(servers ?? {}).map(([serverName, config]) => ({
      serverName,
      title: config.title,
      chatMenu: config.chatMenu,
      consumeOnly: config.consumeOnly,
    }));
    if (isSavedAgent) {
      const carried = getAgentServerNames(
        tools,
        catalog.map((server) => server.serverName),
      );
      const disabled = new Set(ephemeralAgent?.disabled_mcp ?? []);
      return catalog
        .filter((server) => carried.has(server.serverName))
        .map((server) => ({ server, on: !disabled.has(server.serverName) }));
    }
    return catalog
      .filter((server) => server.chatMenu !== false && !server.consumeOnly)
      .map((server) => ({ server, on: chatSelection.includes(server.serverName) }));
  }, [chatSelection, ephemeralAgent?.disabled_mcp, isSavedAgent, servers, tools]);

  return (
    <Section
      title={localize('com_ui_task_context')}
      action={
        files.length > 0 && (
          <div ref={manageRef}>
            <HeadingLink onClick={() => setManageOpen(true)}>
              {localize('com_sidepanel_manage_files')}
            </HeadingLink>
          </div>
        )
      }
      open={open}
      onToggle={onToggle}
    >
      <SubHeading>{localize('com_ui_task_files')}</SubHeading>
      {files.length === 0 ? (
        <ContextRow icon="↑" text={localize('com_ui_task_files_none')} muted />
      ) : (
        <>
          <button
            type="button"
            className="block w-full text-left"
            aria-expanded={filesOpen}
            onClick={() => setFilesOpen((value) => !value)}
          >
            <ContextRow
              icon="▦"
              text={localize('com_ui_task_files_mine', { count: files.length })}
              status={localize('com_ui_task_files_all_used')}
            />
          </button>
          {filesOpen && (
            <ul className="ml-7">
              {files.map((file) => (
                <li key={file.file_id}>
                  <ContextRow
                    icon="·"
                    text={file.filename}
                    status={localize('com_ui_task_file_ready')}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {serverRows.length > 0 && (
        <>
          <SubHeading>{localize('com_ui_task_mcp_servers')}</SubHeading>
          {serverRows.map(({ server, on }) => {
            return (
              <ContextRow
                key={server.serverName}
                icon="▤"
                text={server.title ?? server.serverName}
                status={localize(on ? 'com_ui_task_on' : 'com_ui_task_off')}
                muted={!on}
              />
            );
          })}
        </>
      )}
      <SubHeading>{localize('com_ui_task_model')}</SubHeading>
      <ContextRow
        icon="◇"
        text={modelName}
        status={localize(isTaskMode ? 'com_ui_task_mode_task' : 'com_ui_task_mode_chat')}
      />
      {manageOpen && (
        <MyFilesModal open={manageOpen} onOpenChange={setManageOpen} triggerRef={manageRef} />
      )}
    </Section>
  );
}
