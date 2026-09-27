import { createDemoFileDeleter } from './demo';

type FileOwner = string | { toString: () => string };
type FileFilter = {
  file_id: { $in: string[] };
  user: { $nin: FileOwner[] };
};
type StoredFile = { file_id: string; user: FileOwner };
type DemoFile = { file_id: string; filename: string };

const createFileModel = (documents: StoredFile[]) => ({
  find: (filter: FileFilter, _projection: 'file_id') => ({
    lean: async () =>
      documents
        .filter(
          (document) =>
            filter.file_id.$in.includes(document.file_id) &&
            !filter.user.$nin.some((owner) => String(owner) === String(document.user)),
        )
        .map(({ file_id }) => ({ file_id })),
  }),
});

const user = { _id: { toString: () => 'owner-id' }, email: 'owner@example.com' };

it('keeps a file id held by another account and deletes the remaining files', async () => {
  const files = [
    { file_id: 'shared-id', filename: 'shared.pdf' },
    { file_id: 'private-id', filename: 'private.pdf' },
  ];
  const File = createFileModel([
    { file_id: 'shared-id', user: 'owner-id' },
    { file_id: 'shared-id', user: 'other-id' },
    { file_id: 'private-id', user: 'owner-id' },
  ]);
  let requestedFiles: DemoFile[] = [];
  const processDeleteRequest = async ({ files: deletable }: { files: DemoFile[] }) => {
    requestedFiles = deletable;
    return { deletedFileIds: deletable.map((file) => file.file_id), failedFileIds: [] };
  };
  const warnings: string[] = [];
  const runAsSystem = async <T>(action: () => Promise<T>) => action();
  const deleteFiles = createDemoFileDeleter({
    File,
    logger: { warn: (message) => warnings.push(message) },
    processDeleteRequest,
    runAsSystem,
  });

  const result = await deleteFiles(user, files);

  expect(requestedFiles).toEqual([{ file_id: 'private-id', filename: 'private.pdf' }]);
  expect(result).toEqual({ deletedFileIds: ['private-id'], failedFileIds: ['shared-id'] });
  expect(warnings).toEqual([
    '[demo] owner@example.com: file ids also held by another account, kept: shared-id',
  ]);
});

it('does not call the delete service when every file id is shared', async () => {
  const File = createFileModel([{ file_id: 'shared-id', user: 'other-id' }]);
  let deleteCalls = 0;
  const processDeleteRequest = async () => {
    deleteCalls += 1;
    return { deletedFileIds: [], failedFileIds: [] };
  };
  const runAsSystem = async <T>(action: () => Promise<T>) => action();
  const deleteFiles = createDemoFileDeleter({
    File,
    logger: { warn: () => undefined },
    processDeleteRequest,
    runAsSystem,
  });

  const files: DemoFile[] = [{ file_id: 'shared-id', filename: 'shared.pdf' }];
  const result = await deleteFiles(user, files);

  expect(deleteCalls).toBe(0);
  expect(result).toEqual({ failedFileIds: ['shared-id'] });
});
