import type { MCPServerStatus } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useMCPToolsQuery } from '~/data-provider/MCP/queries';
import MCPStatusBadge from './MCPStatusBadge';
import { useLocalize } from '~/hooks';

interface MCPServerDetailProps {
  serverName: string;
  displayName: string;
  description?: string;
  serverStatus?: MCPServerStatus;
  isInitializing: boolean;
  isOpen: boolean;
}

export default function MCPServerDetail({
  serverName,
  displayName,
  description,
  serverStatus,
  isInitializing,
  isOpen,
}: MCPServerDetailProps) {
  const localize = useLocalize();
  const { data, isLoading, isError } = useMCPToolsQuery({ enabled: isOpen });
  const tools = data?.servers?.[serverName]?.tools;
  const isConnected =
    serverStatus?.connectionState === 'connected' || serverStatus?.requestScoped === true;
  let toolsContent: ReactNode;

  if (isLoading) {
    toolsContent = (
      <p role="status" aria-live="polite" className="text-sm text-text-secondary">
        {localize('com_ui_mcp_detail_loading_tools')}
      </p>
    );
  } else if (isError) {
    toolsContent = (
      <p role="alert" className="text-sm text-text-secondary">
        {localize('com_ui_mcp_detail_error_tools')}
      </p>
    );
  } else if (tools === undefined && !isConnected) {
    toolsContent = (
      <p role="status" className="text-sm text-text-secondary">
        {localize('com_ui_mcp_detail_connect_to_view_tools')}
      </p>
    );
  } else if (!tools?.length) {
    toolsContent = (
      <p role="status" className="text-sm text-text-secondary">
        {localize('com_ui_mcp_detail_no_tools')}
      </p>
    );
  } else {
    toolsContent = (
      <ul className="space-y-2">
        {tools.map((tool) => (
          <li key={tool.pluginKey} className="min-w-0">
            <div className="truncate text-sm font-medium text-text-primary">{tool.name}</div>
            <p
              className="truncate text-xs text-text-secondary"
              title={tool.description || undefined}
            >
              {tool.description || localize('com_ui_mcp_detail_no_description')}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto">
      <header className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-sm font-semibold text-text-primary">
          {displayName}
        </h3>
        {serverStatus || isInitializing ? (
          <MCPStatusBadge
            serverStatus={serverStatus}
            isInitializing={isInitializing}
            className="shrink-0"
          />
        ) : (
          <span role="status" className="shrink-0 text-xs text-text-secondary">
            {localize('com_nav_mcp_status_unknown')}
          </span>
        )}
      </header>

      <section aria-label={localize('com_ui_description')} className="space-y-1">
        <h4 className="text-xs font-semibold text-text-secondary">
          {localize('com_ui_description')}
        </h4>
        <p className="whitespace-pre-wrap break-words text-sm text-text-primary">
          {description?.trim() ? description : localize('com_ui_mcp_detail_no_description')}
        </p>
      </section>

      <section aria-label={localize('com_ui_tools')} className="space-y-2">
        <h4 className="text-xs font-semibold text-text-secondary">{localize('com_ui_tools')}</h4>
        {toolsContent}
      </section>
    </div>
  );
}
