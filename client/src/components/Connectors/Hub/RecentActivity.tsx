import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { splitMCPToolKey } from 'librechat-data-provider';
import type { MCPServerDefinition, TranslationKeys } from '~/hooks';
import { useConnectorActivityQuery } from '~/data-provider/Connectors/queries';
import { getToolLabel } from '../labels';
import { useLocalize } from '~/hooks';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RecentActivity({ servers }: { servers: MCPServerDefinition[] }) {
  const localize = useLocalize();
  const { data: items = [], isLoading, isError } = useConnectorActivityQuery();
  const serverNames = useMemo(() => servers.map((server) => server.serverName), [servers]);
  const titles = useMemo(
    () => new Map(servers.map((server) => [server.serverName, server.config.title])),
    [servers],
  );

  let body = items.map((item) => {
    const [toolName, serverName = ''] = splitMCPToolKey(item.toolKey, serverNames);
    const label = getToolLabel(serverName, toolName);
    return (
      <tr key={`${item.conversationId}-${item.createdAt}-${item.toolKey}`}>
        <td className="whitespace-nowrap py-2.5 pr-4 text-text-secondary">
          {formatTime(item.createdAt)}
        </td>
        <td className="py-2.5 pr-4">{titles.get(serverName) || serverName}</td>
        <td className="py-2.5 pr-4">{label ? localize(label.title) : toolName}</td>
        <td className="max-w-[16rem] truncate py-2.5 pr-4">
          <Link
            to={`/c/${item.conversationId}`}
            className="text-text-primary underline-offset-2 hover:underline"
          >
            {item.conversationTitle || localize('com_ui_untitled')}
          </Link>
        </td>
        <td className="whitespace-nowrap py-2.5 text-right text-text-secondary">
          {localize('com_ui_data_hub_recent_count_value', { 0: String(item.count) })}
        </td>
      </tr>
    );
  });
  let messageKey: TranslationKeys | null = null;
  if (isLoading) {
    messageKey = 'com_ui_connectors_loading';
  } else if (isError) {
    messageKey = 'com_ui_data_hub_recent_error';
  } else if (items.length === 0) {
    messageKey = 'com_ui_data_hub_recent_empty';
  }
  if (messageKey) {
    body = [
      <tr key="status">
        <td colSpan={5} className="py-4 text-text-secondary">
          {localize(messageKey)}
        </td>
      </tr>,
    ];
  }

  return (
    <section aria-labelledby="data-hub-recent-heading" className="mt-8">
      <h2 id="data-hub-recent-heading" className="mb-2 text-lg font-bold text-text-primary">
        {localize('com_ui_data_hub_recent')}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-text-primary" data-testid="data-hub-recent">
          <thead className="border-b border-border-light text-xs text-text-secondary">
            <tr>
              <th className="py-2 pr-4 font-medium">{localize('com_ui_data_hub_recent_time')}</th>
              <th className="py-2 pr-4 font-medium">{localize('com_ui_data_hub_recent_source')}</th>
              <th className="py-2 pr-4 font-medium">{localize('com_ui_data_hub_recent_action')}</th>
              <th className="py-2 pr-4 font-medium">{localize('com_ui_data_hub_recent_where')}</th>
              <th className="py-2 text-right font-medium">
                {localize('com_ui_data_hub_recent_count')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">{body}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-text-secondary">{localize('com_ui_data_hub_recent_note')}</p>
    </section>
  );
}
