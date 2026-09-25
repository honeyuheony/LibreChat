import http from 'http';
import type { DeskStatusResponse } from 'librechat-data-provider';
import type { Request, Response } from 'express';
import type { AddressInfo } from 'net';
import {
  getDeskStatus,
  getDeskRelayConfig,
  parseInstallerPath,
  createDeskStatusHandler,
} from './desk';

const SERVICE_KEY = 'relay-service-key';
const LATEST_YML = [
  'version: 0.1.0',
  'files:',
  '  - url: desk-app-setup-0.1.0.exe',
  '    size: 111650684',
  'path: desk-app-setup-0.1.0.exe',
  "releaseDate: '2026-09-25T06:26:27.705Z'",
].join('\n');

interface FakeRelay {
  url: string;
  statusRequests: Array<{ user: string | null; authorization?: string }>;
  close: () => Promise<void>;
}

type StatusReply = { code: number; body: string };

async function startRelay(
  statusReply: StatusReply,
  latestYml: StatusReply = { code: 200, body: LATEST_YML },
): Promise<FakeRelay> {
  const statusRequests: FakeRelay['statusRequests'] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://relay');
    if (url.pathname === '/internal/status') {
      statusRequests.push({
        user: url.searchParams.get('user'),
        authorization: req.headers.authorization,
      });
      if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) {
        res.writeHead(401).end();
        return;
      }
      res.writeHead(statusReply.code, { 'Content-Type': 'application/json' });
      res.end(statusReply.body);
      return;
    }
    if (url.pathname === '/app/latest.yml') {
      res.writeHead(latestYml.code).end(latestYml.body);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    statusRequests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const onlineBody = JSON.stringify({
  online: true,
  device_name: 'KIM-MINJI-PC',
  folder_name: '업무자료',
  connected_at: '2026-09-25T01:02:03+00:00',
});

describe('getDeskStatus', () => {
  let relay: FakeRelay | undefined;

  afterEach(async () => {
    await relay?.close();
    relay = undefined;
  });

  it('reports the online device, folder and installer link from the relay', async () => {
    relay = await startRelay({ code: 200, body: onlineBody });

    const status = await getDeskStatus(
      {
        internalUrl: relay.url,
        serviceKey: SERVICE_KEY,
        publicUrl: 'https://relay.example.ts.net',
      },
      'user-42',
    );

    expect(status).toEqual<DeskStatusResponse>({
      state: 'online',
      deviceName: 'KIM-MINJI-PC',
      folderName: '업무자료',
      connectedAt: '2026-09-25T01:02:03+00:00',
      installerUrl: 'https://relay.example.ts.net/app/desk-app-setup-0.1.0.exe',
    });
    expect(relay.statusRequests).toEqual([
      { user: 'user-42', authorization: `Bearer ${SERVICE_KEY}` },
    ]);
  });

  it('reports offline with the installer link when no device is connected', async () => {
    relay = await startRelay({
      code: 200,
      body: JSON.stringify({
        online: false,
        device_name: null,
        folder_name: null,
        connected_at: null,
      }),
    });

    const status = await getDeskStatus(
      {
        internalUrl: relay.url,
        serviceKey: SERVICE_KEY,
        publicUrl: 'https://relay.example.ts.net',
      },
      'user-42',
    );

    expect(status).toEqual<DeskStatusResponse>({
      state: 'offline',
      deviceName: null,
      folderName: null,
      connectedAt: null,
      installerUrl: 'https://relay.example.ts.net/app/desk-app-setup-0.1.0.exe',
    });
  });

  it('reports unknown when the relay answers with an error', async () => {
    relay = await startRelay({ code: 500, body: 'boom' });

    const status = await getDeskStatus(
      { internalUrl: relay.url, serviceKey: SERVICE_KEY },
      'user-42',
    );

    expect(status.state).toBe('unknown');
    expect(status.deviceName).toBeNull();
  });

  it('reports unknown when the relay cannot be reached', async () => {
    relay = await startRelay({ code: 200, body: onlineBody });
    const unreachableUrl = relay.url;
    await relay.close();
    relay = undefined;

    const status = await getDeskStatus(
      { internalUrl: unreachableUrl, serviceKey: SERVICE_KEY, timeoutMs: 1000 },
      'user-42',
    );

    expect(status).toEqual<DeskStatusResponse>({
      state: 'unknown',
      deviceName: null,
      folderName: null,
      connectedAt: null,
      installerUrl: null,
    });
  });

  it('does not ask the relay and reports unknown when the service key is missing', async () => {
    relay = await startRelay({ code: 200, body: onlineBody });

    const status = await getDeskStatus({ internalUrl: relay.url }, 'user-42');

    expect(status.state).toBe('unknown');
    expect(relay.statusRequests).toHaveLength(0);
  });

  it('hides the installer link when no public relay address is configured', async () => {
    relay = await startRelay({ code: 200, body: onlineBody });

    const status = await getDeskStatus(
      { internalUrl: relay.url, serviceKey: SERVICE_KEY },
      'user-42',
    );

    expect(status.state).toBe('online');
    expect(status.installerUrl).toBeNull();
  });

  it('hides the installer link when latest.yml is missing', async () => {
    relay = await startRelay({ code: 200, body: onlineBody }, { code: 404, body: '' });

    const status = await getDeskStatus(
      { internalUrl: relay.url, serviceKey: SERVICE_KEY, publicUrl: 'https://relay.example' },
      'user-42',
    );

    expect(status.installerUrl).toBeNull();
  });
});

describe('parseInstallerPath', () => {
  it('reads the top-level path of an electron-builder latest.yml', () => {
    expect(parseInstallerPath(LATEST_YML)).toBe('desk-app-setup-0.1.0.exe');
  });

  it('rejects a path that is not a plain installer file name', () => {
    expect(parseInstallerPath('path: sub/dir/setup.exe')).toBeNull();
    expect(parseInstallerPath('path: setup.zip')).toBeNull();
  });
});

describe('getDeskRelayConfig', () => {
  it('defaults the internal relay URL and leaves key and public URL unset', () => {
    expect(getDeskRelayConfig({})).toEqual({
      internalUrl: 'http://desk-relay:8766',
      serviceKey: undefined,
      publicUrl: undefined,
    });
  });

  it('trims trailing slashes from configured URLs', () => {
    expect(
      getDeskRelayConfig({
        DESK_RELAY_INTERNAL_URL: 'http://relay:9000/',
        DESK_RELAY_SERVICE_KEY: ' key ',
        DESK_RELAY_PUBLIC_URL: 'https://relay.example/',
      }),
    ).toEqual({
      internalUrl: 'http://relay:9000',
      serviceKey: 'key',
      publicUrl: 'https://relay.example',
    });
  });
});

describe('createDeskStatusHandler', () => {
  const makeResponse = () => {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    return res;
  };

  it('answers 401 without a signed-in user', async () => {
    const res = makeResponse();

    await createDeskStatusHandler({ internalUrl: 'http://127.0.0.1:9' })(
      {} as Request,
      res as unknown as Response,
    );

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('asks the relay for the signed-in user', async () => {
    const relay = await startRelay({ code: 200, body: onlineBody });
    const res = makeResponse();
    try {
      await createDeskStatusHandler({ internalUrl: relay.url, serviceKey: SERVICE_KEY })(
        { user: { id: 'user-7' } } as unknown as Request,
        res as unknown as Response,
      );
    } finally {
      await relay.close();
    }

    expect(relay.statusRequests.map((request) => request.user)).toEqual(['user-7']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ state: 'online' }));
  });
});
