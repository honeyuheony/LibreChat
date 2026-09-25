import type { MCPTool } from 'librechat-data-provider';
import { useMCPToolsQuery } from '~/data-provider/MCP/queries';
import { isWriteTool, summarizeToolAccess } from './status';
import { getToolLabel } from './labels';
import { useLocalize } from '~/hooks';
import StatusPill from './Pill';

interface ConnectorToolsProps {
  serverName: string;
  isConnected: boolean;
}

function ToolRow({ serverName, tool }: { serverName: string; tool: MCPTool }) {
  const localize = useLocalize();
  const writes = isWriteTool(tool.name);
  const label = getToolLabel(serverName, tool.name);
  const description = label
    ? localize(label.description)
    : tool.description || localize('com_ui_mcp_detail_no_description');
  return (
    <li className="flex min-w-0 items-start gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        {label ? (
          <div className="truncate text-sm font-medium text-text-primary" title={tool.name}>
            {localize(label.title)}
          </div>
        ) : (
          <div className="truncate font-mono text-sm text-text-primary">{tool.name}</div>
        )}
        <p className="line-clamp-2 text-sm text-text-secondary" title={description}>
          {description}
        </p>
      </div>
      <StatusPill
        tone="neutral"
        label={localize(writes ? 'com_ui_connectors_tool_write' : 'com_ui_connectors_tool_read')}
      />
    </li>
  );
}

/** Tool list of one connector; fetched only once the card is opened. */
export default function ConnectorTools({ serverName, isConnected }: ConnectorToolsProps) {
  const localize = useLocalize();
  const { data, isLoading, isError } = useMCPToolsQuery();
  const tools = data?.servers?.[serverName]?.tools ?? [];

  if (isLoading) {
    return (
      <p role="status" aria-live="polite" className="text-sm text-text-secondary">
        {localize('com_ui_mcp_detail_loading_tools')}
      </p>
    );
  }
  if (isError) {
    return (
      <p role="alert" className="text-sm text-text-secondary">
        {localize('com_ui_mcp_detail_error_tools')}
      </p>
    );
  }
  if (tools.length === 0) {
    return (
      <p role="status" className="text-sm text-text-secondary">
        {localize(
          isConnected ? 'com_ui_mcp_detail_no_tools' : 'com_ui_mcp_detail_connect_to_view_tools',
        )}
      </p>
    );
  }

  const { count, hasWrite } = summarizeToolAccess(tools);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-text-tertiary">
        {localize(
          hasWrite
            ? 'com_ui_connectors_tools_summary_with_write'
            : 'com_ui_connectors_tools_summary_read_only',
          { 0: String(count) },
        )}
      </p>
      <ul aria-label={localize('com_ui_tools')} className="divide-y divide-border-light">
        {tools.map((tool) => (
          <ToolRow key={tool.pluginKey} serverName={serverName} tool={tool} />
        ))}
      </ul>
    </div>
  );
}
