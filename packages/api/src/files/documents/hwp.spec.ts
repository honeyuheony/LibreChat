import os from 'os';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { HWP_UPLOAD_ERRORS, hwpToText } from './hwp';
import { parseDocument } from './crud';

const file = {
  originalname: 'sample.hwp',
  path: path.join(__dirname, 'sample.docx'),
  mimetype: 'application/x-hwp',
} as Express.Multer.File;

const extractResponse = {
  text: '첫 문단\n둘째 문단',
  tables: [
    [
      ['이름', '내용'],
      ['한글', '본문'],
    ],
  ],
  sections: 1,
};

describe('HWP document parser', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  test('sends the file to hwp-mcp and appends tables after the body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(extractResponse), { status: 200 }));

    await expect(hwpToText(file)).resolves.toBe(
      '첫 문단\n둘째 문단\n\n[표 1]\n이름 | 내용\n한글 | 본문',
    );

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('http://hwp-mcp:8765/extract');
    expect(request?.method).toBe('POST');
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    const body = request?.body as FormData;
    expect((body.get('file') as File).name).toBe('sample.hwp');
    expect(body.get('filename')).toBe('sample.hwp');
  });

  test('routes HWP uploads through hwp-mcp and stores its text', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(extractResponse), { status: 200 }));

    await expect(parseDocument({ file })).resolves.toMatchObject({
      filename: 'sample.hwp',
      filepath: 'document_parser',
      text: '첫 문단\n둘째 문단\n\n[표 1]\n이름 | 내용\n한글 | 본문',
    });
  });

  test('reports protected HWP files with the upload guidance', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'protected', message: 'protected document' }), {
        status: 422,
      }),
    );

    await expect(hwpToText(file)).rejects.toThrow(HWP_UPLOAD_ERRORS.protected);
  });

  test.each(['unreadable', 'unsupported'] as const)(
    'reports %s documents as unreadable',
    async (error) => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error, message: 'invalid document' }), { status: 422 }),
      );

      await expect(hwpToText(file)).rejects.toThrow(HWP_UPLOAD_ERRORS.unreadable);
    },
  );

  test('rejects an HWPX zip bomb before sending it to hwp-mcp', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
    zip.file('Contents/section0.xml', 'x'.repeat(26 * 1024 * 1024), { compression: 'DEFLATE' });
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hwpx-bomb-'));
    const bombPath = path.join(dir, 'bomb.hwpx');
    await fs.promises.writeFile(bombPath, await zip.generateAsync({ type: 'nodebuffer' }));
    try {
      const bomb = {
        originalname: 'bomb.hwpx',
        path: bombPath,
        mimetype: 'application/hwp+zip',
      } as Express.Multer.File;
      await expect(parseDocument({ file: bomb })).rejects.toThrow(/MB per-entry decompressed cap/);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  test('sends a binary HWP (not a zip) to hwp-mcp without the zip check', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hwp-cfb-'));
    const hwpPath = path.join(dir, 'binary.hwp');
    // HWP 5.0 is a Compound File Binary container, which starts with this signature
    await fs.promises.writeFile(
      hwpPath,
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]),
    );
    fetchMock.mockResolvedValue(new Response(JSON.stringify(extractResponse), { status: 200 }));
    try {
      await expect(
        hwpToText({ ...file, originalname: 'binary.hwp', path: hwpPath } as Express.Multer.File),
      ).resolves.toContain('첫 문단');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  test('reports a failed hwp-mcp connection with the upload guidance', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));

    await expect(hwpToText(file)).rejects.toThrow(HWP_UPLOAD_ERRORS.connection);
  });

  test('rejects an empty extraction response', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ...extractResponse, text: '', tables: [] }), { status: 200 }),
    );

    await expect(hwpToText(file)).rejects.toThrow(HWP_UPLOAD_ERRORS.unreadable);
  });
});
