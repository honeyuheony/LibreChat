import { useMCPToolsQuery } from '~/data-provider/MCP/queries';
import { getToolLabel } from '../labels';
import { isWriteTool } from '../status';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/** The connector's tools as chips; the ones that change data are marked. */
export default function ToolChips({
  serverName,
  isConnected,
}: {
  serverName: string;
  isConnected: boolean;
}) {
  const localize = useLocalize();
  const { data, isLoading, isError } = useMCPToolsQuery();
  const tools = data?.servers?.[serverName]?.tools ?? [];

  if (isLoading) {
    return (
      <p role="status" aria-live="polite" className="px-1 text-sm text-text-secondary">
        {localize('com_ui_mcp_detail_loading_tools')}
      </p>
    );
  }
  if (isError) {
    return (
      <p role="alert" className="px-1 text-sm text-text-secondary">
        {localize('com_ui_mcp_detail_error_tools')}
      </p>
    );
  }
  if (tools.length === 0) {
    return (
      <p role="status" className="px-1 text-sm text-text-secondary">
        {localize(
          isConnected ? 'com_ui_mcp_detail_no_tools' : 'com_ui_mcp_detail_connect_to_view_tools',
        )}
      </p>
    );
  }

  return (
    <ul aria-label={localize('com_ui_tools')} className="flex flex-wrap gap-1.5">
      {tools.map((tool) => {
        const label = getToolLabel(serverName, tool.name);
        const writes = isWriteTool(tool.name);
        const description = label ? localize(label.description) : tool.description;
        return (
          <li
            key={tool.pluginKey}
            title={description || tool.name}
            className={cn(
              'rounded-full px-3 py-1 text-sm',
              writes
                ? 'bg-status-warning-subtle text-status-warning'
                : 'bg-surface-secondary text-text-primary ring-1 ring-inset ring-border-light',
            )}
          >
            {label ? localize(label.title) : tool.name}
            {writes && ` · ${localize('com_ui_connectors_tool_write')}`}
          </li>
        );
      })}
    </ul>
  );
}
