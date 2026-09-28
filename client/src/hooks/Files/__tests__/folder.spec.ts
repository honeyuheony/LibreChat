import { megabyte } from 'librechat-data-provider';
import { getUploadHint, selectFolderUploads } from '../folder';

const named = (path: string, type = '') => {
  const file = new File(['x'], path.split('/').pop() ?? path, { type });
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
};

describe('selectFolderUploads', () => {
  it('keeps the files the endpoint accepts and counts the rest as skipped', () => {
    const files = [
      named('report/a.pdf', 'application/pdf'),
      named('report/.DS_Store'),
      named('report/tool.exe', 'application/x-msdownload'),
      named('report/sub/b.hwp'),
    ];
    const { accepted, skipped } = selectFolderUploads(files, [
      /^application\/pdf$/,
      /^application\/x-hwp$/,
    ]);
    expect(accepted.map((file) => file.name)).toEqual(['a.pdf', 'b.hwp']);
    expect(skipped).toBe(2);
  });

  it('fills in the type a browser left empty so the upload check does not reject it', () => {
    const { accepted } = selectFolderUploads(
      [named('docs/plan.docx')],
      [/^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/],
    );
    expect(accepted.map((file) => [file.name, file.type])).toEqual([
      ['plan.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ]);
  });

  it('falls back to the default allowlist when the endpoint names none', () => {
    const { accepted, skipped } = selectFolderUploads([
      named('docs/notes.txt', 'text/plain'),
      named('docs/.hidden'),
    ]);
    expect(accepted).toHaveLength(1);
    expect(skipped).toBe(1);
  });
});

describe('getUploadHint', () => {
  it('lists the document formats the endpoint allows and the per-file cap', () => {
    const hint = getUploadHint({
      supportedMimeTypes: [/^application\/pdf$/, /^application\/x-hwp$/],
      fileSizeLimit: 20 * megabyte,
    });
    expect(hint).toEqual({ formats: ['hwp', 'pdf'], perFileLimit: '20 MB' });
  });

  it('omits the cap when none is configured', () => {
    expect(getUploadHint({ supportedMimeTypes: [/^application\/pdf$/] })).toEqual({
      formats: ['pdf'],
      perFileLimit: undefined,
    });
  });
});
