import { useState } from 'react';
import { Monitor } from 'lucide-react';
import { Button } from '@librechat/client';
import type { DeskStatusResponse } from 'librechat-data-provider';
import type { MCPServerDefinition, TranslationKeys } from '~/hooks';
import type { PillTone } from './status';
import { useDeskStatusQuery } from '~/data-provider/Connectors/queries';
import { DESK_DOWNLOAD_PATH } from './status';
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

export interface DeskView {
  labelKey: TranslationKeys;
  tone: PillTone;
  summary: string;
}

export function describeDesk(
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
    summarizeFolders(status.folders, localize),
    status.deviceName ?? '',
    status.connectedAt ? formatConnectedAt(status.connectedAt, Date.now(), localize) : '',
  ];
  return {
    labelKey: 'com_ui_connectors_desk_online',
    tone: 'success',
    summary: parts.filter(Boolean).join(' · '),
  };
}

const FOLDERS_SHOWN = 2;

/** "Folders (3): 문서, 바탕 화면 and 1 more" — the first two names, then a count. */
export function summarizeFolders(folders: string[], localize: Localize): string {
  if (folders.length === 0) {
    return localize('com_ui_connectors_desk_no_folders');
  }
  const shown = folders.slice(0, FOLDERS_SHOWN).join(', ');
  const names =
    folders.length > FOLDERS_SHOWN
      ? localize('com_ui_connectors_desk_folders_more', {
          0: shown,
          1: String(folders.length - FOLDERS_SHOWN),
        })
      : shown;
  return localize('com_ui_connectors_desk_folders', { 0: String(folders.length), 1: names });
}

/** The desktop app's own on/off state, since the relay MCP connection reads "connected" even with the app closed. */
export default function DeskConnectorCard({ server }: { server: MCPServerDefinition }) {
  const localize = useLocalize();
  const [expanded, setExpanded] = useState(true);
  const { data: status, isError } = useDeskStatusQuery();
  const view = describeDesk(status, isError, localize);
  const displayName = server.config.title || server.serverName;
  const offerDownload = status?.state !== 'online' && !!status?.installerUrl;

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
        offerDownload ? (
          <Button asChild size="sm" shape="theme" variant="submit">
            <a href={DESK_DOWNLOAD_PATH} target="_blank" rel="noopener noreferrer">
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
