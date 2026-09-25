import { useState } from 'react';
import { Monitor } from 'lucide-react';
import { Button } from '@librechat/client';
import type { DeskStatusResponse } from 'librechat-data-provider';
import type { MCPServerDefinition, TranslationKeys } from '~/hooks';
import type { PillTone } from './status';
import { useDeskStatusQuery } from '~/data-provider/Connectors/queries';
import { useLocalize } from '~/hooks';
import ConnectorFrame from './Frame';
import ConnectorTools from './Tools';
import StatusPill from './Pill';

type Localize = ReturnType<typeof useLocalize>;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatConnectedAt(connectedAt: string, now: number, localize: Localize): string {
  const connectedMs = Date.parse(connectedAt);
  if (Number.isNaN(connectedMs)) {
    return '';
  }
  const elapsed = Math.max(0, now - connectedMs);
  if (elapsed < MINUTE_MS) {
    return localize('com_ui_connectors_desk_connected_just_now');
  }
  if (elapsed < HOUR_MS) {
    return localize('com_ui_connectors_desk_connected_minutes', {
      0: String(Math.floor(elapsed / MINUTE_MS)),
    });
  }
  if (elapsed < DAY_MS) {
    return localize('com_ui_connectors_desk_connected_hours', {
      0: String(Math.floor(elapsed / HOUR_MS)),
    });
  }
  return localize('com_ui_connectors_desk_connected_on', {
    0: new Date(connectedMs).toLocaleDateString(),
  });
}

interface DeskView {
  labelKey: TranslationKeys;
  tone: PillTone;
  summary: string;
}

function describeDesk(
  status: DeskStatusResponse | undefined,
  isError: boolean,
  localize: Localize,
): DeskView {
  if (isError || status?.state === 'unknown') {
    return {
      labelKey: 'com_ui_connectors_desk_unknown',
      tone: 'neutral',
      summary: localize('com_ui_connectors_desk_unknown_hint'),
    };
  }
  if (!status) {
    return {
      labelKey: 'com_ui_connectors_status_checking',
      tone: 'neutral',
      summary: '',
    };
  }
  if (status.state === 'offline') {
    return {
      labelKey: 'com_ui_connectors_desk_offline',
      tone: 'neutral',
      summary: localize('com_ui_connectors_desk_offline_hint'),
    };
  }
  const parts = [
    status.folderName ? localize('com_ui_connectors_desk_folder', { 0: status.folderName }) : '',
    status.deviceName ?? '',
    status.connectedAt ? formatConnectedAt(status.connectedAt, Date.now(), localize) : '',
  ];
  return {
    labelKey: 'com_ui_connectors_desk_online',
    tone: 'success',
    summary: parts.filter(Boolean).join(' · '),
  };
}

/** The desktop app's own on/off state, since the relay MCP connection reads "connected" even with the app closed. */
export default function DeskConnectorCard({ server }: { server: MCPServerDefinition }) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(true);
  const { data: status, isError } = useDeskStatusQuery();
  const view = describeDesk(status, isError, localize);
  const displayName = server.config.title || server.serverName;
  const installerUrl = status?.state === 'online' ? null : status?.installerUrl;

  return (
    <ConnectorFrame
      emphasized
      icon={<Monitor className="size-5" strokeWidth={1.8} />}
      name={displayName}
      pill={
        <StatusPill
          tone={view.tone}
          label={localize(view.labelKey)}
          withDot={view.tone === 'success'}
        />
      }
      summary={view.summary}
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
      action={
        installerUrl ? (
          <Button asChild size="sm" shape="theme" variant="submit">
            <a href={installerUrl} download>
              {localize('com_ui_connectors_desk_download')}
            </a>
          </Button>
        ) : undefined
      }
    >
      <ConnectorTools serverName={server.serverName} isConnected={status?.state === 'online'} />
    </ConnectorFrame>
  );
}
