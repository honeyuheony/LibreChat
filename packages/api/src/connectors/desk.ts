import { logger } from '@librechat/data-schemas';
import type { DeskAppReleaseResponse, DeskStatusResponse } from 'librechat-data-provider';
import type { Request, Response } from 'express';

const DEFAULT_INTERNAL_URL = 'http://desk-relay:8766';
/** Unmeasured: long enough for an in-cluster hop, short enough not to stall the settings dialog. */
const RELAY_TIMEOUT_MS = 3000;
const INSTALLER_FILE_PATTERN = /^[\w.-]+\.exe$/;

export interface DeskRelayConfig {
  /** Container-network relay base URL (`/internal/status`, `/app/latest.yml`). */
  internalUrl: string;
  /** `DESK_RELAY_SERVICE_KEY`; without it the relay is not asked at all. */
  serviceKey?: string;
  /** Address users' browsers reach the relay at; without it no installer link is offered. */
  publicUrl?: string;
  timeoutMs?: number;
}

interface RelayStatusBody {
  online: boolean;
  device_name: string | null;
  folder_name: string | null;
  connected_at: string | null;
}

const unknownStatus = (installerUrl: string | null): DeskStatusResponse => ({
  state: 'unknown',
  deviceName: null,
  folderName: null,
  connectedAt: null,
  installerUrl,
});

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '');

export function getDeskRelayConfig(env: NodeJS.ProcessEnv = process.env): DeskRelayConfig {
  return {
    internalUrl: trimTrailingSlash(env.DESK_RELAY_INTERNAL_URL?.trim() || DEFAULT_INTERNAL_URL),
    serviceKey: env.DESK_RELAY_SERVICE_KEY?.trim() || undefined,
    publicUrl: env.DESK_RELAY_PUBLIC_URL?.trim()
      ? trimTrailingSlash(env.DESK_RELAY_PUBLIC_URL.trim())
      : undefined,
  };
}

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

function parseRelayStatus(body: unknown): RelayStatusBody | null {
  if (typeof body !== 'object' || body === null || !('online' in body)) {
    return null;
  }
  const fields = body as Partial<Record<keyof RelayStatusBody, unknown>>;
  if (typeof fields.online !== 'boolean') {
    return null;
  }
  return {
    online: fields.online,
    device_name: optionalString(fields.device_name),
    folder_name: optionalString(fields.folder_name),
    connected_at: optionalString(fields.connected_at),
  };
}

/** Reads the installer file name from electron-builder's `latest.yml` (`path:` line). */
export function parseInstallerPath(latestYml: string): string | null {
  const match = latestYml.match(/^path:\s*['"]?([^'"\s]+)['"]?\s*$/m);
  const fileName = match?.[1];
  return fileName && INSTALLER_FILE_PATTERN.test(fileName) ? fileName : null;
}

const noRelease: DeskAppReleaseResponse = {
  installerUrl: null,
  version: null,
  sizeBytes: null,
  releaseDate: null,
};

const topLevelField = (latestYml: string, name: string): string | null =>
  latestYml.match(new RegExp(`^${name}:\\s*['"]?([^'"\\s]+)['"]?\\s*$`, 'm'))?.[1] ?? null;

/**
 * Reads the release shown on the download page from electron-builder's `latest.yml`.
 * The size comes from the `files:` entry whose `url` is the top-level `path`.
 */
export function parseRelease(latestYml: string): Omit<DeskAppReleaseResponse, 'installerUrl'> {
  const fileName = parseInstallerPath(latestYml);
  let sizeBytes: number | null = null;
  if (fileName) {
    const entry = latestYml.split(/^\s*- /m).find((block) => block.startsWith(`url: ${fileName}`));
    const size = Number(entry?.match(/^\s*size:\s*(\d+)\s*$/m)?.[1]);
    sizeBytes = Number.isSafeInteger(size) && size > 0 ? size : null;
  }
  const releaseDate = topLevelField(latestYml, 'releaseDate');
  return {
    version: topLevelField(latestYml, 'version'),
    sizeBytes,
    releaseDate: releaseDate && !Number.isNaN(Date.parse(releaseDate)) ? releaseDate : null,
  };
}

/** Without a public relay address users could not download anything, so no release is offered. */
async function fetchRelease(config: DeskRelayConfig): Promise<DeskAppReleaseResponse> {
  if (!config.publicUrl) {
    return noRelease;
  }
  try {
    const response = await fetch(`${config.internalUrl}/app/latest.yml`, {
      signal: AbortSignal.timeout(config.timeoutMs ?? RELAY_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn(`[deskApp] latest.yml answered ${response.status}; hiding the app link`);
      return noRelease;
    }
    const latestYml = await response.text();
    const fileName = parseInstallerPath(latestYml);
    if (!fileName) {
      logger.warn('[deskApp] latest.yml has no usable installer path; hiding the app link');
      return noRelease;
    }
    return {
      ...parseRelease(latestYml),
      installerUrl: `${config.publicUrl}/app/${encodeURIComponent(fileName)}`,
    };
  } catch (error) {
    logger.warn('[deskApp] Could not read latest.yml from the relay', error);
    return noRelease;
  }
}

async function fetchRelayStatus(
  config: DeskRelayConfig,
  userId: string,
): Promise<RelayStatusBody | null> {
  if (!config.serviceKey) {
    logger.warn('[deskStatus] DESK_RELAY_SERVICE_KEY is not set; desktop app status is unknown');
    return null;
  }
  try {
    const response = await fetch(
      `${config.internalUrl}/internal/status?user=${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${config.serviceKey}` },
        signal: AbortSignal.timeout(config.timeoutMs ?? RELAY_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      logger.warn(`[deskStatus] Relay status answered ${response.status}`);
      return null;
    }
    const parsed = parseRelayStatus(await response.json());
    if (!parsed) {
      logger.warn('[deskStatus] Relay status body did not match the expected shape');
    }
    return parsed;
  } catch (error) {
    logger.warn('[deskStatus] Could not reach the desk relay', error);
    return null;
  }
}

/** Relay failures surface as `state: 'unknown'` so the connectors screen can say it could not check. */
export async function getDeskStatus(
  config: DeskRelayConfig,
  userId: string,
): Promise<DeskStatusResponse> {
  const [relayStatus, { installerUrl }] = await Promise.all([
    fetchRelayStatus(config, userId),
    fetchRelease(config),
  ]);
  if (!relayStatus) {
    return unknownStatus(installerUrl);
  }
  if (!relayStatus.online) {
    return { ...unknownStatus(installerUrl), state: 'offline' };
  }
  return {
    state: 'online',
    deviceName: relayStatus.device_name,
    folderName: relayStatus.folder_name,
    connectedAt: relayStatus.connected_at,
    installerUrl,
  };
}

interface DeskStatusRequest extends Request {
  user?: { id?: string };
}

export function createDeskStatusHandler(
  config: DeskRelayConfig,
): (req: DeskStatusRequest, res: Response) => Promise<Response> {
  return async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    return res.json(await getDeskStatus(config, userId));
  };
}

/** Public: the download page is also reachable from the sign-in screen, before any session exists. */
export function createDeskAppReleaseHandler(
  config: DeskRelayConfig,
): (req: Request, res: Response) => Promise<Response> {
  return async (_req, res) => res.json(await fetchRelease(config));
}
