import http from 'http';
import type { DeskPermission, DeskStatusResponse } from 'librechat-data-provider';
import type { Request, Response } from 'express';
import type { AddressInfo } from 'net';
import {
  getDeskStatus,
  getDeskPermissions,
  getDeskRelayConfig,
  parseRelease,
  parseInstallerPath,
  createDeskStatusHandler,
  createDeskPermissionsHandler,
  createDeskAppReleaseHandler,
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
  permissionRequests: Array<{ user: string | null; authorization?: string }>;
  close: () => Promise<void>;
}

type StatusReply = { code: number; body: string };

async function startRelay(
  statusReply: StatusReply,
  latestYml: StatusReply = { code: 200, body: LATEST_YML },
  permissionsReply: StatusReply = { code: 200, body: '[]' },
): Promise<FakeRelay> {
  const statusRequests: FakeRelay['statusRequests'] = [];
  const permissionRequests: FakeRelay['permissionRequests'] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://relay');
    const internalRoutes: Record<string, [FakeRelay['statusRequests'], StatusReply]> = {
      '/internal/status': [statusRequests, statusReply],
      '/internal/permissions': [permissionRequests, permissionsReply],
    };
    const internal = internalRoutes[url.pathname];
    if (internal) {
      const [seen, reply] = internal;
      seen.push({
        user: url.searchParams.get('user'),
        authorization: req.headers.authorization,
      });
      if (req.headers.authorization !== `Bearer ${SERVICE_KEY}`) {
        res.writeHead(401).end();
        return;
      }
      res.writeHead(reply.code, { 'Content-Type': 'application/json' });
      res.end(reply.body);
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
    permissionRequests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const onlineBody = JSON.stringify({
  online: true,
  device_name: 'KIM-MINJI-PC',
  folders: ['업무자료', '문서', '바탕 화면'],
  folder_name: '업무자료',
  connected_at: '2026-09-25T01:02:03+00:00',
});

describe('getDeskStatus', () => {
  let relay: FakeRelay | undefined;

  afterEach(async () => {
    await relay?.close();
    relay = undefined;
  });

  it('reports the online device, folders and installer link from the relay', async () => {
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
      folders: ['업무자료', '문서', '바탕 화면'],
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
      folders: [],
      connectedAt: null,
      installerUrl: 'https://relay.example.ts.net/app/desk-app-setup-0.1.0.exe',
    });
  });

  it('reads the single folder_name of a relay that does not send folders yet', async () => {
    relay = await startRelay({
      code: 200,
      body: JSON.stringify({
        online: true,
        device_name: 'KIM-MINJI-PC',
        folder_name: '업무자료',
        connected_at: '2026-09-25T01:02:03+00:00',
      }),
    });

    const status = await getDeskStatus(
      { internalUrl: relay.url, serviceKey: SERVICE_KEY },
      'user-42',
    );

    expect(status.folders).toEqual(['업무자료']);
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
      folders: [],
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

describe('parseRelease', () => {
  it('reads version, installer size and release date', () => {
    expect(parseRelease(LATEST_YML)).toEqual({
      version: '0.1.0',
      sizeBytes: 111650684,
      releaseDate: '2026-09-25T06:26:27.705Z',
    });
  });

  it('takes the size of the file named by path, not of another listed file', () => {
    const latestYml = [
      'version: 0.2.0',
      'files:',
      '  - url: desk-app-setup-0.2.0.zip',
      '    size: 5',
      '  - url: desk-app-setup-0.2.0.exe',
      '    size: 120000000',
      'path: desk-app-setup-0.2.0.exe',
    ].join('\n');
    expect(parseRelease(latestYml).sizeBytes).toBe(120000000);
  });

  it('leaves unreadable fields null', () => {
    expect(parseRelease("path: desk-app-setup-0.1.0.exe\nreleaseDate: 'yesterday'")).toEqual({
      version: null,
      sizeBytes: null,
      releaseDate: null,
    });
  });
});

describe('createDeskAppReleaseHandler', () => {
  it('answers without a signed-in user and links the installer through the public address', async () => {
    const relay = await startRelay({ code: 500, body: '' });
    const res = { json: jest.fn() };
    try {
      await createDeskAppReleaseHandler({
        internalUrl: relay.url,
        publicUrl: 'https://relay.example.ts.net',
      })({} as Request, res as unknown as Response);
    } finally {
      await relay.close();
    }

    expect(res.json).toHaveBeenCalledWith({
      installerUrl: 'https://relay.example.ts.net/app/desk-app-setup-0.1.0.exe',
      version: '0.1.0',
      sizeBytes: 111650684,
      releaseDate: '2026-09-25T06:26:27.705Z',
    });
  });

  it('offers no release when latest.yml is missing', async () => {
    const relay = await startRelay({ code: 500, body: '' }, { code: 404, body: '' });
    const res = { json: jest.fn() };
    try {
      await createDeskAppReleaseHandler({
        internalUrl: relay.url,
        publicUrl: 'https://relay.example.ts.net',
      })({} as Request, res as unknown as Response);
    } finally {
      await relay.close();
    }

    expect(res.json).toHaveBeenCalledWith({
      installerUrl: null,
      version: null,
      sizeBytes: null,
      releaseDate: null,
    });
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

describe('getDeskPermissions', () => {
  let relay: FakeRelay | undefined;

  afterEach(async () => {
    await relay?.close();
    relay = undefined;
  });

  const waiting = {
    request_id: 7,
    path: 'D:\\보고서\\1분기.hwp',
    local_port: 50123,
    approve_token: 'token-1',
    expires_at: '2026-09-26T01:02:00+00:00',
  };

  it("returns the user's waiting permissions from the relay", async () => {
    relay = await startRelay({ code: 200, body: onlineBody }, undefined, {
      code: 200,
      body: JSON.stringify([waiting]),
    });

    const permissions = await getDeskPermissions(
      { internalUrl: relay.url, serviceKey: SERVICE_KEY },
      'user-42',
    );

    expect(permissions).toEqual<DeskPermission[]>([
      {
        requestId: 7,
        path: 'D:\\보고서\\1분기.hwp',
        localPort: 50123,
        approveToken: 'token-1',
        expiresAt: '2026-09-26T01:02:00+00:00',
      },
    ]);
    expect(relay.permissionRequests).toEqual([
      { user: 'user-42', authorization: `Bearer ${SERVICE_KEY}` },
    ]);
  });

  it('drops entries without a local port or with the wrong shape', async () => {
    relay = await startRelay({ code: 200, body: onlineBody }, undefined, {
      code: 200,
      body: JSON.stringify([
        { ...waiting, local_port: null },
        { ...waiting, request_id: 'seven' },
        { ...waiting, request_id: 8 },
      ]),
    });

    const permissions = await getDeskPermissions(
      { internalUrl: relay.url, serviceKey: SERVICE_KEY },
      'user-42',
    );

    expect(permissions.map((permission) => permission.requestId)).toEqual([8]);
  });

  it('returns no permissions when the relay fails or no service key is set', async () => {
    relay = await startRelay({ code: 200, body: onlineBody }, undefined, {
      code: 500,
      body: 'boom',
    });

    expect(
      await getDeskPermissions({ internalUrl: relay.url, serviceKey: SERVICE_KEY }, 'user-42'),
    ).toEqual([]);
    expect(await getDeskPermissions({ internalUrl: relay.url }, 'user-42')).toEqual([]);
    expect(relay.permissionRequests).toHaveLength(1);
  });

  it('answers 401 without a signed-in user and asks only for the signed-in user', async () => {
    relay = await startRelay({ code: 200, body: onlineBody }, undefined, {
      code: 200,
      body: JSON.stringify([waiting]),
    });
    const handler = createDeskPermissionsHandler({
      internalUrl: relay.url,
      serviceKey: SERVICE_KEY,
    });
    const reply = () => {
      const res = { status: jest.fn(), json: jest.fn() };
      res.status.mockReturnValue(res);
      res.json.mockReturnValue(res);
      return res;
    };

    const anonymous = reply();
    await handler({} as Request, anonymous as unknown as Response);
    expect(anonymous.status).toHaveBeenCalledWith(401);

    const signedIn = reply();
    await handler(
      { user: { id: 'user-9' } } as unknown as Request,
      signedIn as unknown as Response,
    );
    expect(signedIn.json).toHaveBeenCalledWith([expect.objectContaining({ requestId: 7 })]);
    expect(relay.permissionRequests.map((request) => request.user)).toEqual(['user-9']);
  });
});
