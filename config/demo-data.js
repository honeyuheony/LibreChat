/**
 * Demo baseline export and reset shared by `export-demo-baseline.js` and `reset-demo.js`.
 * Reads and writes the raw collections so `_id`, ObjectIds and dates round-trip through EJSON.
 */
const fs = require('fs');
const path = require('path');
const { BSON } = require('mongodb');
const { createModels } = require('@librechat/data-schemas');

/** Never exported or reset; `DEMO_RESET_PROTECTED` can add to this list but not remove from it. */
const PROTECTED_EMAILS = ['admin@admin.com', 'demo@example.com'];

/** Demo default agent (`librechat.yaml` modelSpecs), same id as `add-task-tools-to-agent.js`. */
const DEFAULT_AGENT_ID = 'agent_mFf0h9SHTwJ6za2e8HUiv';

/**
 * Per-account collections and the field holding the owner id (String or ObjectId per schema);
 * `searchKey` marks the Meilisearch primary key of collections the search index mirrors.
 */
const ACCOUNT_COLLECTIONS = [
  { model: 'Conversation', owner: 'user', searchKey: 'conversationId' },
  { model: 'Message', owner: 'user', searchKey: 'messageId' },
  { model: 'TaskResult', owner: 'user' },
  { model: 'TaskExtraction', owner: 'user' },
  { model: 'TaskSummary', owner: 'user' },
  { model: 'File', owner: 'user' },
  { model: 'Schedule', owner: 'user' },
  { model: 'ScheduleRun', owner: 'user' },
  { model: 'Skill', owner: 'author' },
  { model: 'SkillFile', owner: 'author' },
  { model: 'SkillPack', owner: 'author' },
];

/** Profile and settings fields restored on the user document; password and tokens are not among them. */
const USER_FIELDS = [
  'name',
  'department',
  'organization',
  'personalization.instructions',
  'personalization.approvalMode',
];

const AGENT_FIELDS = ['instructions', 'tools'];

/** mongoMeili bookkeeping copied into the baseline at export; it describes the index back then. */
const SEARCH_STATE_FIELDS = [
  '_meiliIndexAttempted',
  '_meiliIndexVersion',
  '_meiliIndexSchemaVersion',
];

const MANIFEST_FILE = 'manifest.json';

/** @param {string | undefined} list @returns {string[]} */
function parseEmails(list) {
  return (list ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** @param {string | undefined} extra @returns {Set<string>} */
function resolveProtectedEmails(extra) {
  return new Set([...PROTECTED_EMAILS, ...parseEmails(extra)]);
}

/**
 * Reads `<dir> [--users a,b] [--include-shared] [--dry-run]`; `DEMO_RESET_USERS`,
 * `DEMO_RESET_PROTECTED` and `DEMO_BASELINE_DIR` fill in what the arguments leave out.
 * @param {string[]} argv @param {NodeJS.ProcessEnv} env
 */
function parseCliArgs(argv, env) {
  const usersIndex = argv.indexOf('--users');
  const usersValue = usersIndex === -1 ? undefined : argv[usersIndex + 1];
  const positional = argv.filter(
    (arg, index) => !arg.startsWith('--') && (usersIndex === -1 || index !== usersIndex + 1),
  );
  return {
    dir: positional[0] ?? env.DEMO_BASELINE_DIR,
    emails: parseEmails(usersIndex === -1 ? env.DEMO_RESET_USERS : usersValue),
    includeShared: argv.includes('--include-shared'),
    dryRun: argv.includes('--dry-run'),
    protectedEmails: resolveProtectedEmails(env.DEMO_RESET_PROTECTED),
  };
}

/** @param {Record<string, unknown>} doc @param {string} dotted */
function getPath(doc, dotted) {
  return dotted.split('.').reduce((value, key) => (value == null ? undefined : value[key]), doc);
}

function writeJson(dir, file, value) {
  fs.writeFileSync(path.join(dir, file), BSON.EJSON.stringify(value, null, 2, { relaxed: false }));
}

function readJson(dir, file) {
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Baseline file missing: ${filePath}. Export the baseline again.`);
  }
  return BSON.EJSON.parse(fs.readFileSync(filePath, 'utf8'), { relaxed: false });
}

/** Owner ids are stored as String in some schemas and ObjectId in others; match both. */
const ownerFilter = (owner, userId) => ({ [owner]: { $in: [userId, String(userId)] } });

const idKey = (id) => String(id);

const fileOf = (collection) => `${collection.collectionName}.json`;

/** Restored documents start unindexed, so a failed index write still leaves them for the next sync. */
const asUnindexed = (doc) => ({
  ...Object.fromEntries(Object.entries(doc).filter(([key]) => !SEARCH_STATE_FIELDS.includes(key))),
  _meiliIndex: false,
});

/**
 * Builds export and reset over the given mongoose connection, the way `createModels(mongoose)` does.
 * @param {typeof import('mongoose')} mongoose
 */
function createDemoData(mongoose) {
  const models = createModels(mongoose);
  const collectionOf = (modelName) =>
    mongoose.connection.db.collection(models[modelName].collection.collectionName);
  const users = collectionOf('User');
  const agents = collectionOf('Agent');
  const usage = collectionOf('DeploymentSkillUsage');

  /** Drops protected and missing accounts with a warning; returns the users to work on. */
  async function findTargetUsers({ emails, protectedEmails, warn }) {
    const allowed = emails.filter((email) => {
      if (!protectedEmails.has(email)) {
        return true;
      }
      warn(`Skipping protected account ${email}.`);
      return false;
    });
    const found = await users
      .find({ email: { $in: allowed } }, { projection: { _id: 1, email: 1, tenantId: 1 } })
      .toArray();
    const foundEmails = new Set(found.map((user) => user.email));
    allowed
      .filter((email) => !foundEmails.has(email))
      .forEach((email) => warn(`Skipping ${email}: no such user in the database.`));
    return found;
  }

  /**
   * Writes the target accounts' data (and the shared data with `includeShared`) to `dir`.
   * @param {{ dir: string, emails: string[], includeShared?: boolean, agentId?: string,
   *   protectedEmails?: Set<string>, warn: (message: string) => void }} params
   */
  async function exportBaseline({
    dir,
    emails,
    includeShared = false,
    agentId = DEFAULT_AGENT_ID,
    protectedEmails = resolveProtectedEmails(),
    warn,
  }) {
    const targets = await findTargetUsers({ emails, protectedEmails, warn });
    const userIds = targets.map((user) => user._id);
    fs.mkdirSync(dir, { recursive: true });

    const profileProjection = Object.fromEntries(
      ['email', ...USER_FIELDS].map((field) => [field, 1]),
    );
    const profiles = await users
      .find({ _id: { $in: userIds } }, { projection: profileProjection })
      .sort({ _id: 1 })
      .toArray();
    writeJson(dir, fileOf(users), profiles);

    const counts = { [fileOf(users)]: profiles.length };
    for (const { model, owner } of ACCOUNT_COLLECTIONS) {
      const collection = collectionOf(model);
      const owners = [...userIds, ...userIds.map(String)];
      const docs = await collection
        .find({ [owner]: { $in: owners } })
        .sort({ _id: 1 })
        .toArray();
      writeJson(dir, fileOf(collection), docs);
      counts[fileOf(collection)] = docs.length;
    }

    if (includeShared) {
      const agentProjection = Object.fromEntries(['id', ...AGENT_FIELDS].map((f) => [f, 1]));
      const agentDocs = await agents
        .find({ id: agentId }, { projection: agentProjection })
        .toArray();
      if (agentDocs.length === 0) {
        warn(`Default agent ${agentId} not found; ${fileOf(agents)} is empty.`);
      }
      writeJson(dir, fileOf(agents), agentDocs);
      counts[fileOf(agents)] = agentDocs.length;
      const usageDocs = await usage.find({}).sort({ _id: 1 }).toArray();
      writeJson(dir, fileOf(usage), usageDocs);
      counts[fileOf(usage)] = usageDocs.length;
    }

    writeJson(dir, MANIFEST_FILE, {
      exportedAt: new Date(),
      includeShared,
      agentId,
      users: profiles.map((user) => ({ _id: user._id, email: user.email })),
    });
    return counts;
  }

  /**
   * Makes `collection` hold exactly `baselineDocs` among the documents matching `filter`:
   * removes the rest, then replaces or creates each baseline document under its `_id`.
   */
  async function syncDocuments({ collection, filter, baselineDocs, dryRun, beforeDelete }) {
    const current = await collection.find(filter, { projection: { _id: 1 } }).toArray();
    const currentIds = new Set(current.map((doc) => idKey(doc._id)));
    const baselineIds = new Set(baselineDocs.map((doc) => idKey(doc._id)));
    const staleIds = current.map((doc) => doc._id).filter((id) => !baselineIds.has(idKey(id)));
    const replaced = baselineDocs.filter((doc) => currentIds.has(idKey(doc._id))).length;
    const counts = {
      collection: collection.collectionName,
      deleted: staleIds.length,
      replaced,
      created: baselineDocs.length - replaced,
    };
    if (dryRun) {
      return counts;
    }

    const deletableIds = beforeDelete ? await beforeDelete(staleIds) : staleIds;
    // Delete before restoring: unique indexes (schedule slot, skill name) may be held by a stale row.
    if (deletableIds.length > 0) {
      await collection.deleteMany({ _id: { $in: deletableIds } });
    }
    if (baselineDocs.length > 0) {
      await collection.bulkWrite(
        baselineDocs.map((doc) => ({
          replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
        })),
        { ordered: true },
      );
    }
    return { ...counts, deleted: deletableIds.length };
  }

  /** Removes originals through `deleteFiles`; returns the ids whose metadata may go too. */
  function fileDeleter({ collection, user, deleteFiles, warn }) {
    return async (staleIds) => {
      if (staleIds.length === 0) {
        return staleIds;
      }
      const files = await collection.find({ _id: { $in: staleIds } }).toArray();
      const { failedFileIds = [] } = await deleteFiles(user, files);
      const failed = new Set(failedFileIds);
      if (failed.size > 0) {
        warn(`${user.email}: could not delete files ${[...failed].join(', ')}; metadata kept.`);
      }
      return files.filter((file) => !failed.has(file.file_id)).map((file) => file._id);
    };
  }

  async function resetUserProfile({ user, profile, dryRun }) {
    const row = {
      email: user.email,
      collection: users.collectionName,
      deleted: 0,
      replaced: 1,
      created: 0,
    };
    if (dryRun) {
      return row;
    }
    const $set = {};
    const $unset = {};
    for (const field of USER_FIELDS) {
      const value = getPath(profile, field);
      if (value === undefined) {
        $unset[field] = '';
      } else {
        $set[field] = value;
      }
    }
    const update = Object.keys($unset).length > 0 ? { $set, $unset } : { $set };
    await users.updateOne({ _id: user._id }, update);
    return row;
  }

  /**
   * Raw writes skip the mongoMeili hooks: drop every id the account had or gets back from the
   * index, then index the restored documents. The reset stands even if this fails.
   */
  async function syncSearchIndex({
    model,
    searchKey,
    searchIndex,
    currentKeys,
    baselineDocs,
    user,
    warn,
  }) {
    const keys = [...new Set([...currentKeys, ...baselineDocs.map((doc) => doc[searchKey])])];
    try {
      await searchIndex.remove(model, keys);
      await searchIndex.add(model, baselineDocs);
    } catch (error) {
      warn(`${user.email}: search index for ${model} not updated (${error.message}).`);
    }
  }

  async function resetAccount({ user, profile, baseline, dryRun, deleteFiles, searchIndex, warn }) {
    const rows = [await resetUserProfile({ user, profile, dryRun })];
    for (const { model, owner, searchKey } of ACCOUNT_COLLECTIONS) {
      const collection = collectionOf(model);
      const filter = ownerFilter(owner, user._id);
      const ownDocs = baseline(collection).filter((doc) => idKey(doc[owner]) === idKey(user._id));
      const baselineDocs = searchKey ? ownDocs.map(asUnindexed) : ownDocs;
      const trackSearch = searchKey && searchIndex && !dryRun;
      const currentKeys = trackSearch
        ? (await collection.find(filter, { projection: { [searchKey]: 1 } }).toArray()).map(
            (doc) => doc[searchKey],
          )
        : [];
      const beforeDelete =
        model === 'File' ? fileDeleter({ collection, user, deleteFiles, warn }) : undefined;
      const counts = await syncDocuments({
        collection,
        filter,
        baselineDocs,
        dryRun,
        beforeDelete,
      });
      if (trackSearch) {
        await syncSearchIndex({
          model,
          searchKey,
          searchIndex,
          currentKeys,
          baselineDocs,
          user,
          warn,
        });
      }
      rows.push({ email: user.email, ...counts });
    }
    return rows;
  }

  async function resetShared({ baseline, agentId, dryRun, warn }) {
    const rows = [];
    const agentDoc = baseline(agents).find((doc) => doc.id === agentId);
    const exists = agentDoc ? await agents.countDocuments({ id: agentId }) : 0;
    if (!agentDoc || exists === 0) {
      warn(
        `Default agent ${agentId} missing from the ${agentDoc ? 'database' : 'baseline'}; skipped.`,
      );
    } else {
      rows.push({ collection: agents.collectionName, deleted: 0, replaced: 1, created: 0 });
      if (!dryRun) {
        const $set = Object.fromEntries(AGENT_FIELDS.map((field) => [field, agentDoc[field]]));
        await agents.updateOne({ id: agentId }, { $set });
      }
    }
    rows.push(
      await syncDocuments({
        collection: usage,
        filter: {},
        baselineDocs: baseline(usage),
        dryRun,
      }),
    );
    return rows;
  }

  /**
   * Restores the target accounts (and the shared data with `includeShared`) from the baseline in `dir`.
   * @param {{ dir: string, emails: string[], includeShared?: boolean, dryRun?: boolean,
   *   protectedEmails?: Set<string>, warn: (message: string) => void,
   *   deleteFiles: (user: { _id: unknown, email: string }, files: object[]) =>
   *     Promise<{ failedFileIds?: string[] }>,
   *   searchIndex?: import('@librechat/api').DemoSearchIndex }} params
   * @returns {Promise<Array<{ email?: string, collection: string, deleted: number,
   *   replaced: number, created: number }>>}
   */
  async function resetDemo({
    dir,
    emails,
    includeShared = false,
    dryRun = false,
    protectedEmails = resolveProtectedEmails(),
    deleteFiles,
    searchIndex,
    warn,
  }) {
    const manifest = readJson(dir, MANIFEST_FILE);
    if (includeShared && !manifest.includeShared) {
      throw new Error(
        'The baseline was exported without --include-shared; export it again with it.',
      );
    }
    const cache = new Map();
    const baseline = (collection) => {
      const file = fileOf(collection);
      if (!cache.has(file)) {
        cache.set(file, readJson(dir, file));
      }
      return cache.get(file);
    };
    const profiles = new Map(baseline(users).map((doc) => [doc.email, doc]));

    const targets = await findTargetUsers({ emails, protectedEmails, warn });
    const rows = [];
    for (const user of targets) {
      const profile = profiles.get(user.email);
      if (!profile) {
        warn(`Skipping ${user.email}: not in the baseline.`);
        continue;
      }
      if (idKey(profile._id) !== idKey(user._id)) {
        warn(`Skipping ${user.email}: user id differs from the baseline (account was recreated).`);
        continue;
      }
      rows.push(
        ...(await resetAccount({
          user,
          profile,
          baseline,
          dryRun,
          deleteFiles,
          searchIndex,
          warn,
        })),
      );
    }
    if (includeShared) {
      rows.push(...(await resetShared({ baseline, agentId: manifest.agentId, dryRun, warn })));
    }
    return rows;
  }

  return { exportBaseline, resetDemo };
}

module.exports = {
  PROTECTED_EMAILS,
  DEFAULT_AGENT_ID,
  ACCOUNT_COLLECTIONS,
  USER_FIELDS,
  parseEmails,
  parseCliArgs,
  resolveProtectedEmails,
  createDemoData,
};
