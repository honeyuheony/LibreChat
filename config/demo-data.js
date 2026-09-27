/**
 * `export-demo-baseline.js` 와 `reset-demo.js` 가 함께 쓰는 데모 기준 데이터 내보내기·초기화.
 * `_id`·ObjectId·날짜가 EJSON 을 거쳐 그대로 돌아오도록 컬렉션을 모델 없이 직접 읽고 쓴다.
 */
const fs = require('fs');
const path = require('path');
const { BSON } = require('mongodb');
const { createModels } = require('@librechat/data-schemas');

/** 내보내지도 초기화하지도 않는 계정. `DEMO_RESET_PROTECTED` 로 더할 수는 있어도 뺄 수는 없다. */
const PROTECTED_EMAILS = ['admin@admin.com', 'demo@example.com'];

/** 데모 기본 agent(`librechat.yaml` 의 modelSpecs). */
const DEFAULT_AGENT_ID = 'agent_mFf0h9SHTwJ6za2e8HUiv';

/**
 * 계정별 컬렉션과 소유자 id 를 담은 필드(스키마에 따라 String 또는 ObjectId).
 * `searchKey` 는 검색 색인이 따라 담는 컬렉션의 Meilisearch 기본 키다.
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

/** 사용자 문서에서 되돌리는 프로필·설정 필드. 비밀번호와 토큰은 넣지 않는다. */
const USER_FIELDS = [
  'name',
  'department',
  'organization',
  'personalization.instructions',
  'personalization.approvalMode',
];

const AGENT_FIELDS = ['instructions', 'tools'];

/** 내보낼 때 기준 데이터에 함께 담긴 mongoMeili 기록 필드. 그 시점의 색인 상태라 되돌리지 않는다. */
const SEARCH_STATE_FIELDS = [
  '_meiliIndexAttempted',
  '_meiliIndexVersion',
  '_meiliIndexSchemaVersion',
];

const MANIFEST_FILE = 'manifest.json';

function parseEmails(list) {
  return (list ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function resolveProtectedEmails(extra) {
  return new Set([...PROTECTED_EMAILS, ...parseEmails(extra)]);
}

/**
 * `<dir> [--users a,b] [--include-shared] [--dry-run]` 를 읽는다. 인자로 주지 않은 값은
 * `DEMO_RESET_USERS`·`DEMO_RESET_PROTECTED`·`DEMO_BASELINE_DIR` 에서 채운다.
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

/** 소유자 id 를 String 으로 두는 스키마와 ObjectId 로 두는 스키마가 섞여 있어 둘 다 맞춘다. */
const ownerFilter = (owner, userId) => ({ [owner]: { $in: [userId, String(userId)] } });

const idKey = (id) => String(id);

const fileOf = (collection) => `${collection.collectionName}.json`;

/** 되돌린 문서를 색인 전 상태로 두어, 색인 쓰기가 실패해도 다음 동기화에서 다시 잡히게 한다. */
const asUnindexed = (doc) => ({
  ...Object.fromEntries(Object.entries(doc).filter(([key]) => !SEARCH_STATE_FIELDS.includes(key))),
  _meiliIndex: false,
});

/**
 * `createModels(mongoose)` 처럼 넘겨받은 mongoose 연결 위에 내보내기와 초기화를 만든다.
 * @param {typeof import('mongoose')} mongoose
 */
function createDemoData(mongoose) {
  const models = createModels(mongoose);
  const collectionOf = (modelName) =>
    mongoose.connection.db.collection(models[modelName].collection.collectionName);
  const users = collectionOf('User');
  const agents = collectionOf('Agent');
  const usage = collectionOf('DeploymentSkillUsage');

  /** 보호 계정과 없는 계정은 경고하고 빼며, 작업할 사용자를 돌려준다. */
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
   * 대상 계정의 데이터(`includeShared` 면 공용 데이터도)를 `dir` 에 쓴다.
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
   * `filter` 에 맞는 문서가 정확히 `baselineDocs` 만 남도록 나머지는 지우고, 기준 문서는
   * 같은 `_id` 로 바꿔 쓰거나 새로 만든다.
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
    // 남은 문서가 고유 색인(예약 시간대, 스킬 이름)을 쥐고 있을 수 있어 되돌리기 전에 먼저 지운다.
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

  /** 원본 파일을 `deleteFiles` 로 지우고, 메타데이터까지 지워도 되는 id 를 돌려준다. */
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
   * 되돌린 id 가운데 다른 계정도 가진 것. 색인은 id 하나에 문서 하나만 두므로 이것을 다시
   * 넣으면 그 계정의 항목을 덮어쓴다.
   */
  async function findSharedSearchKeys({ collection, owner, searchKey, user, baselineDocs }) {
    const keys = baselineDocs.map((doc) => doc[searchKey]);
    const shared = await collection
      .find(
        { [searchKey]: { $in: keys }, [owner]: { $nin: [user._id, String(user._id)] } },
        { projection: { [searchKey]: 1 } },
      )
      .toArray();
    return new Set(shared.map((doc) => doc[searchKey]));
  }

  /**
   * 직접 쓰기는 mongoMeili 훅을 거치지 않으므로, 계정의 색인 문서를 사용자 기준으로 지운 뒤
   * 다른 계정과 겹치지 않는 되돌린 문서만 색인한다. 여기서 실패해도 초기화는 유지한다.
   */
  async function syncSearchIndex({
    collection,
    model,
    owner,
    searchKey,
    searchIndex,
    baselineDocs,
    user,
    warn,
  }) {
    try {
      const sharedKeys = await findSharedSearchKeys({
        collection,
        owner,
        searchKey,
        user,
        baselineDocs,
      });
      if (sharedKeys.size > 0) {
        warn(
          `${user.email}: ${model} ids also held by another account, left out of search: ${[...sharedKeys].join(', ')}`,
        );
      }
      await searchIndex.remove(model, String(user._id));
      await searchIndex.add(
        model,
        baselineDocs.filter((doc) => !sharedKeys.has(doc[searchKey])),
      );
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
      const beforeDelete =
        model === 'File' ? fileDeleter({ collection, user, deleteFiles, warn }) : undefined;
      const counts = await syncDocuments({
        collection,
        filter,
        baselineDocs,
        dryRun,
        beforeDelete,
      });
      if (searchKey && searchIndex && !dryRun) {
        await syncSearchIndex({
          collection,
          model,
          owner,
          searchKey,
          searchIndex,
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
   * `dir` 의 기준 데이터로 대상 계정(`includeShared` 면 공용 데이터도)을 되돌린다.
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
