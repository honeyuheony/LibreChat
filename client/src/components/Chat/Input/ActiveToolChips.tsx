import { memo } from 'react';
import { MCPIcon } from '@librechat/client';
import {
  composerChipClassName,
  composerChipIconClassName,
  composerChipCloseClassName,
} from './chip';
import CustomIcon from '~/components/ui/CustomIcon';
import useComposerTools from './useComposerTools';
import { useLocalize } from '~/hooks';

const CLOSE_GLYPH = '×';

/** 활성 connector·tool을 칩으로 표시하고, ×는 해당 항목을 끈다. */
function ActiveToolChips({
  showBuiltinTools,
  showConnectors,
  agentId,
}: {
  showBuiltinTools: boolean;
  showConnectors: boolean;
  agentId?: string | null;
}) {
  const localize = useLocalize();
  const { switchableServers, builtinTools, isConnectorOn, toggleConnector } = useComposerTools({
    showBuiltinTools,
    showConnectors,
    agentId,
  });

  const chips = [
    ...switchableServers
      .filter((server) => isConnectorOn(server.serverName))
      .map((server) => ({
        key: `mcp-${server.serverName}`,
        label: server.config?.title || server.serverName,
        icon: server.config?.iconPath ? (
          <CustomIcon src={server.config.iconPath} className="size-3 object-contain" alt="" />
        ) : (
          <MCPIcon />
        ),
        turnOff: () => toggleConnector(server.serverName),
      })),
    ...builtinTools
      .filter((tool) => tool.enabled)
      .map((tool) => ({
        key: `tool-${tool.id}`,
        label: tool.label,
        icon: tool.icon,
        turnOff: tool.onToggle,
      })),
  ];

  if (chips.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label={localize('com_ui_tools')}>
      {chips.map((chip) => (
        <li key={chip.key} className={composerChipClassName} data-testid="active-tool-chip">
          <span
            aria-hidden="true"
            data-testid="active-tool-chip-icon"
            className={composerChipIconClassName}
          >
            {chip.icon}
          </span>
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            onClick={chip.turnOff}
            aria-label={localize('com_ui_turn_off_tool', { 0: chip.label })}
            className={composerChipCloseClassName}
          >
            <span aria-hidden="true">{CLOSE_GLYPH}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default memo(ActiveToolChips);
