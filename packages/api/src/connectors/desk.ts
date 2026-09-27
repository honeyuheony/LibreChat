import { logger } from '@librechat/data-schemas';
import type {
  DeskPermission,
  DeskStatusResponse,
  DeskAppReleaseResponse,
} from 'librechat-data-provider';
import type { Request, Response } from 'express';

const DEFAULT_INTERNAL_URL = 'http://desk-relay:8766';
/** 클러스터 안 한 번 건너가기에는 넉넉하고, 설정 창을 붙잡아 두지는 않을 만큼 짧게 잡았다. */
const RELAY_TIMEOUT_MS = 3000;
const INSTALLER_FILE_PATTERN = /^[\w.-]+\.exe$/;

export interface DeskRelayConfig {
  /** 컨테이너 네트워크 안의 relay 기본 URL(`/internal/status`, `/internal/permissions`, `/app/latest.yml`). */
  internalUrl: string;
  /** `DESK_RELAY_SERVICE_KEY`. 없으면 relay 에 아예 묻지 않는다. */
  serviceKey?: string;
  /** 사용자 브라우저가 relay 에 닿는 주소. 없으면 설치 파일 링크를 주지 않는다. */
  publicUrl?: string;
  timeoutMs?: number;
}

interface RelayStatusBody {
  online: boolean;
  device_name: string | null;
  folders: string[];
  connected_at: string | null;
}

const unknownStatus = (installerUrl: string | null): DeskStatusResponse => ({
  state: 'unknown',
  deviceName: null,
  folders: [],
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
  const fields = body as Partial<Record<keyof RelayStatusBody | 'folder_name', unknown>>;
  if (typeof fields.online !== 'boolean') {
    return null;
  }
  /** 여러 폴더를 지원하기 전의 relay 는 `folder_name` 만 보낸다. */
  const legacyFolder = optionalString(fields.folder_name);
  let folders: string[] = legacyFolder ? [legacyFolder] : [];
  if (Array.isArray(fields.folders)) {
    folders = fields.folders.filter((name): name is string => typeof name === 'string');
  }
  return {
    online: fields.online,
    device_name: optionalString(fields.device_name),
    folders,
    connected_at: optionalString(fields.connected_at),
  };
}

function parseRelayPermission(entry: unknown): DeskPermission | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const fields = entry as Record<string, unknown>;
  const { request_id, path, local_port, approve_token, expires_at } = fields;
  if (
    !Number.isInteger(request_id) ||
    !Number.isInteger(local_port) ||
    typeof path !== 'string' ||
    typeof approve_token !== 'string' ||
    typeof expires_at !== 'string'
  ) {
    return null;
  }
  return {
    requestId: request_id as number,
    path,
    localPort: local_port as number,
    approveToken: approve_token,
    expiresAt: expires_at,
  };
}

/** electron-builder 가 만든 `latest.yml` 의 `path:` 줄에서 설치 파일 이름을 읽는다. */
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
 * 다운로드 페이지에 보일 릴리스 정보를 electron-builder 의 `latest.yml` 에서 읽는다.
 * 크기는 `files:` 항목 가운데 `url` 이 최상위 `path` 와 같은 항목에서 가져온다.
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

/** 공개 relay 주소가 없으면 사용자가 아무것도 내려받을 수 없으므로 릴리스를 알려 주지 않는다. */
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

/** relay 가 실패하면 `state: 'unknown'` 으로 돌려, 커넥터 화면이 확인하지 못했다고 말할 수 있게 한다. */
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
    folders: relayStatus.folders,
    connectedAt: relayStatus.connected_at,
    installerUrl,
  };
}

/**
 * 켜 둔 폴더 밖을 읽으려고 사용자 앱이 허락을 기다리는 요청을 가져온다. 실패하면 빈 목록을 돌려
 * 채팅에 권한 카드가 뜨지 않을 뿐이고, 앱 자체 창은 여전히 묻는다.
 */
export async function getDeskPermissions(
  config: DeskRelayConfig,
  userId: string,
): Promise<DeskPermission[]> {
  if (!config.serviceKey) {
    return [];
  }
  try {
    const response = await fetch(
      `${config.internalUrl}/internal/permissions?user=${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${config.serviceKey}` },
        signal: AbortSignal.timeout(config.timeoutMs ?? RELAY_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      logger.warn(`[deskPermissions] Relay permissions answered ${response.status}`);
      return [];
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      logger.warn('[deskPermissions] Relay permissions body was not a list');
      return [];
    }
    return body
      .map(parseRelayPermission)
      .filter((permission): permission is DeskPermission => permission !== null);
  } catch (error) {
    logger.warn('[deskPermissions] Could not reach the desk relay', error);
    return [];
  }
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

/** 로그인한 사용자 본인의 요청만 돌려준다. 요청마다 든 토큰으로 그 사용자의 PC 가 답을 받아들이기 때문이다. */
export function createDeskPermissionsHandler(
  config: DeskRelayConfig,
): (req: DeskStatusRequest, res: Response) => Promise<Response> {
  return async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    return res.json(await getDeskPermissions(config, userId));
  };
}

/** 로그인 전 화면에서도 다운로드 페이지에 들어올 수 있으므로 인증 없이 연다. */
export function createDeskAppReleaseHandler(
  config: DeskRelayConfig,
): (req: Request, res: Response) => Promise<Response> {
  return async (_req, res) => res.json(await fetchRelease(config));
}
