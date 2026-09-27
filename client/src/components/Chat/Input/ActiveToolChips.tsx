import { memo } from 'react';
import useComposerTools from './useComposerTools';
import { useLocalize } from '~/hooks';

const CLOSE_GLYPH = '×';

const chipClassName =
  'inline-flex max-w-[220px] items-center gap-1 rounded-full border border-accent-primary/25 bg-surface-brand-subtle py-0.5 pl-2.5 pr-1.5 text-[13px] text-accent-primary';

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
        turnOff: () => toggleConnector(server.serverName),
      })),
    ...builtinTools
      .filter((tool) => tool.enabled)
      .map((tool) => ({ key: `tool-${tool.id}`, label: tool.label, turnOff: tool.onToggle })),
  ];

  if (chips.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label={localize('com_ui_tools')}>
      {chips.map((chip) => (
        <li key={chip.key} className={chipClassName} data-testid="active-tool-chip">
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            onClick={chip.turnOff}
            aria-label={localize('com_ui_turn_off_tool', { 0: chip.label })}
            className="flex size-4 flex-shrink-0 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            <span aria-hidden="true">{CLOSE_GLYPH}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default memo(ActiveToolChips);
