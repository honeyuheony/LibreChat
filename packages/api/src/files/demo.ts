import type { AppConfig } from '@librechat/data-schemas';

type FileOwner = string | { toString: () => string };
type DemoFile = { file_id: string };
type DemoUser = {
  _id: FileOwner;
  email: string;
  tenantId?: string;
};
type FileQuery = {
  file_id: { $in: string[] };
  user: { $nin: FileOwner[] };
};
type FileModel = {
  find: (
    filter: FileQuery,
    projection: 'file_id',
  ) => {
    lean: () => Promise<DemoFile[]>;
  };
};
type DeleteResult = {
  deletedFileIds?: string[];
  failedFileIds?: string[];
};
type DeleteRequest<TFile extends DemoFile> = {
  req: {
    user: { id: string; email: string; tenantId?: string };
    config: AppConfig | undefined;
    body: Record<string, never>;
  };
  files: TFile[];
};
type FileDeleterDependencies<TFile extends DemoFile> = {
  File: FileModel;
  processDeleteRequest: (request: DeleteRequest<TFile>) => Promise<DeleteResult | null | undefined>;
  runAsSystem: <T>(action: () => Promise<T>) => Promise<T>;
  logger: { warn: (message: string) => void };
  appConfig?: AppConfig;
};

async function findSharedFileIds<TFile extends DemoFile>(
  File: FileModel,
  user: DemoUser,
  files: TFile[],
): Promise<Set<string>> {
  const owners = [user._id, String(user._id)];
  const shared = await File.find(
    { file_id: { $in: files.map((file) => file.file_id) }, user: { $nin: owners } },
    'file_id',
  ).lean();
  return new Set(shared.map((file) => file.file_id));
}

export function createDemoFileDeleter<TFile extends DemoFile>({
  File,
  processDeleteRequest,
  runAsSystem,
  logger,
  appConfig,
}: FileDeleterDependencies<TFile>): (user: DemoUser, files: TFile[]) => Promise<DeleteResult> {
  return (user, files) =>
    runAsSystem(async () => {
      const sharedIds = await findSharedFileIds(File, user, files);
      if (sharedIds.size > 0) {
        logger.warn(
          `[demo] ${user.email}: file ids also held by another account, kept: ${[...sharedIds].join(', ')}`,
        );
      }
      // processDeleteRequest deletes metadata by file_id, so shared ids must stay failed.
      const deletable = files.filter((file) => !sharedIds.has(file.file_id));
      const result =
        deletable.length > 0
          ? await processDeleteRequest({
              req: {
                user: { id: String(user._id), email: user.email, tenantId: user.tenantId },
                config: appConfig,
                body: {},
              },
              files: deletable,
            })
          : {};
      return { ...(result ?? {}), failedFileIds: [...(result?.failedFileIds ?? []), ...sharedIds] };
    });
}
