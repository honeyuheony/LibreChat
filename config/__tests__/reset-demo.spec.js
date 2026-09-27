const os = require('os');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels, logger } = require('@librechat/data-schemas');
const {
  PROTECTED_EMAILS,
  ACCOUNT_COLLECTIONS,
  DEFAULT_AGENT_ID,
  resolveProtectedEmails,
  parseCliArgs,
  parseEmails,
  createDemoData,
} = require('../demo-data');
const { createDemoSearchIndex } = require('@librechat/api');
const { createResetDemoFileDeleter } = require('../reset-demo-files');

logger.silent = true;

const ADMIN = 'admin@admin.com';
const DEMO = 'demo@example.com';
const LEE = 'lee@example.com';
const OTHER = 'other@example.com';

const ids = {
  admin: new ObjectId(),
  demo: new ObjectId(),
  lee: new ObjectId(),
  other: new ObjectId(),
};

let mongoServer;
let models;
let demoData;
let baselineDir;
let warnings;

const db = () => mongoose.connection.db;
const col = (modelName) => db().collection(models[modelName].collection.collectionName);

/** Every document of every collection, keyed by collection name, in `_id` order. */
async function dumpAll() {
  const collections = await db().listCollections().toArray();
  const names = collections.map((c) => c.name).sort();
  const entries = await Promise.all(
    names.map(async (name) => [
      name,
      await db().collection(name).find({}).sort({ _id: 1 }).toArray(),
    ]),
  );
  return Object.fromEntries(entries);
}

/** The protected accounts' conversations, messages, files and user documents. */
async function dumpProtected() {
  const userIds = [ids.admin, ids.demo];
  const owners = [...userIds, ...userIds.map(String)];
  const [users, conversations, messages, files] = await Promise.all([
    col('User')
      .find({ _id: { $in: userIds } })
      .sort({ _id: 1 })
      .toArray(),
    col('Conversation')
      .find({ user: { $in: owners } })
      .sort({ _id: 1 })
      .toArray(),
    col('Message')
      .find({ user: { $in: owners } })
      .sort({ _id: 1 })
      .toArray(),
    col('File')
      .find({ user: { $in: owners } })
      .sort({ _id: 1 })
      .toArray(),
  ]);
  return { users, conversations, messages, files };
}

function makeUser(_id, email, name) {
  return {
    _id,
    email,
    name,
    username: email.split('@')[0],
    password: `hash-of-${email}`,
    role: 'USER',
    provider: 'local',
    emailVerified: true,
    department: `${name} 부서`,
    organization: `${name} 기관`,
    personalization: { memories: true, instructions: `${name} 지침`, approvalMode: 'ask' },
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  };
}

function makeConvo(userId, conversationId, title) {
  return {
    _id: new ObjectId(),
    conversationId,
    user: String(userId),
    title,
    endpoint: 'agents',
    createdAt: new Date('2026-09-02T00:00:00Z'),
    updatedAt: new Date('2026-09-02T00:00:00Z'),
    _meiliIndex: true,
    _meiliIndexSchemaVersion: 1,
  };
}

function makeMessage(userId, conversationId, messageId, text) {
  return {
    _id: new ObjectId(),
    messageId,
    conversationId,
    user: String(userId),
    text,
    isCreatedByUser: true,
    createdAt: new Date('2026-09-02T00:00:00Z'),
    _meiliIndex: true,
    _meiliIndexSchemaVersion: 1,
  };
}

function makeFile(userId, fileId) {
  return {
    _id: new ObjectId(),
    user: userId,
    file_id: fileId,
    filename: `${fileId}.pdf`,
    filepath: `/uploads/${userId}/${fileId}.pdf`,
    type: 'application/pdf',
    bytes: 10,
    object: 'file',
    usage: 0,
    source: 'local',
  };
}

async function seedBaselineState() {
  await col('User').insertMany([
    makeUser(ids.admin, ADMIN, '관리자'),
    makeUser(ids.demo, DEMO, '데모'),
    makeUser(ids.lee, LEE, '이순신'),
    makeUser(ids.other, OTHER, '다른사람'),
  ]);
  await col('Conversation').insertMany([
    makeConvo(ids.lee, 'lee-convo-1', '시나리오 대화'),
    makeConvo(ids.admin, 'admin-convo-1', '관리자 대화'),
    makeConvo(ids.demo, 'demo-convo-1', '데모 대화'),
  ]);
  await col('Message').insertMany([
    makeMessage(ids.lee, 'lee-convo-1', 'lee-msg-1', '기준 메시지'),
    makeMessage(ids.admin, 'admin-convo-1', 'admin-msg-1', '관리자 메시지'),
    makeMessage(ids.demo, 'demo-convo-1', 'demo-msg-1', '데모 메시지'),
  ]);
  await col('File').insertMany([
    makeFile(ids.lee, 'lee-file-1'),
    makeFile(ids.admin, 'admin-file-1'),
    makeFile(ids.demo, 'demo-file-1'),
  ]);
  await col('Schedule').insertOne({
    _id: new ObjectId(),
    id: 'sched-baseline',
    user: ids.lee,
    name: '기준 예약',
    enabled: true,
    deleting: false,
    slot: 0,
  });
  await col('Skill').insertOne({
    _id: new ObjectId(),
    name: 'baseline-skill',
    author: ids.lee,
    useCount: 3,
  });
  await col('TaskResult').insertOne({
    _id: new ObjectId(),
    user: ids.lee,
    conversationId: 'lee-convo-1',
    title: '기준 결과',
  });
  await col('Agent').insertOne({
    _id: new ObjectId(),
    id: DEFAULT_AGENT_ID,
    name: '업무 도우미',
    author: ids.admin,
    instructions: '기준 지시문',
    tools: ['a', 'b'],
    provider: 'openAI',
    model: 'gpt',
  });
  await col('DeploymentSkillUsage').insertOne({
    _id: new ObjectId(),
    skillId: new ObjectId(),
    name: 'deployed',
    useCount: 5,
  });
  await col('Token').insertMany([
    { _id: new ObjectId(), userId: ids.lee, type: 'refresh', token: 'login-token' },
    { _id: new ObjectId(), userId: ids.lee, type: 'mcp_oauth', token: 'google-token' },
  ]);
}

/** Changes made after the baseline was taken: what a demo run leaves behind. */
async function driftAfterBaseline() {
  await col('Conversation').insertMany([
    makeConvo(ids.lee, 'lee-convo-2', '새 대화'),
    makeConvo(ids.admin, 'admin-convo-2', '관리자 새 대화'),
    makeConvo(ids.demo, 'demo-convo-2', '데모 새 대화'),
  ]);
  await col('Conversation').updateOne(
    { conversationId: 'lee-convo-1' },
    { $set: { title: '바뀐 제목' } },
  );
  await col('Message').deleteOne({ messageId: 'lee-msg-1' });
  await col('Message').insertMany([
    makeMessage(ids.lee, 'lee-convo-2', 'lee-msg-2', '새 메시지'),
    makeMessage(ids.admin, 'admin-convo-2', 'admin-msg-2', '관리자 새 메시지'),
  ]);
  await col('File').insertMany([
    makeFile(ids.lee, 'lee-file-2'),
    makeFile(ids.admin, 'admin-file-2'),
  ]);
  await col('Schedule').deleteOne({ id: 'sched-baseline' });
  await col('Schedule').insertOne({
    _id: new ObjectId(),
    id: 'sched-new',
    user: ids.lee,
    name: '새 예약',
    deleting: false,
    slot: 0,
  });
  await col('ScheduleRun').insertOne({
    _id: new ObjectId(),
    user: ids.lee,
    scheduleId: new ObjectId(),
  });
  await col('Skill').insertOne({ _id: new ObjectId(), name: 'new-skill', author: ids.lee });
  await col('Skill').updateOne({ name: 'baseline-skill' }, { $set: { useCount: 99 } });
  await col('SkillPack').insertOne({ _id: new ObjectId(), name: '새 팩', author: ids.lee });
  await col('TaskExtraction').insertOne({ _id: new ObjectId(), user: ids.lee, fileId: 'x' });
  await col('User').updateOne(
    { _id: ids.lee },
    {
      $set: {
        name: '바뀐 이름',
        organization: '바뀐 기관',
        password: 'changed-hash',
        'personalization.instructions': '바뀐 지침',
        'personalization.approvalMode': 'auto',
      },
      $unset: { department: '' },
    },
  );
  await col('User').updateOne({ _id: ids.admin }, { $set: { name: '관리자 새 이름' } });
  await col('Token').insertOne({
    _id: new ObjectId(),
    userId: ids.lee,
    type: 'mcp_oauth',
    token: 'new',
  });
  await col('Agent').updateOne(
    { id: DEFAULT_AGENT_ID },
    { $set: { instructions: '바뀐 지시문', tools: ['a', 'b', 'c'] } },
  );
  await col('DeploymentSkillUsage').updateMany({}, { $set: { useCount: 50 } });
  await col('DeploymentSkillUsage').insertOne({
    _id: new ObjectId(),
    skillId: new ObjectId(),
    name: 'later',
    useCount: 1,
  });
}

/** Stands in for `processDeleteRequest`: removes the metadata the way the service does. */
const deleteFiles = jest.fn(async (_user, files) => {
  await col('File').deleteMany({ _id: { $in: files.map((f) => f._id) } });
  return { deletedFileIds: files.map((f) => f.file_id), failedFileIds: [] };
});

const warn = (message) => warnings.push(message);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  models = createModels(mongoose);
  await Promise.all(Object.values(models).map((model) => model.init()));
  demoData = createDemoData(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  warnings = [];
  deleteFiles.mockClear();
  const collections = await db().listCollections().toArray();
  await Promise.all(collections.map(({ name }) => db().collection(name).deleteMany({})));
  await seedBaselineState();
  baselineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-baseline-'));
  await demoData.exportBaseline({
    dir: baselineDir,
    emails: [LEE, ADMIN, DEMO],
    includeShared: true,
    warn,
  });
  await driftAfterBaseline();
});

afterEach(() => {
  fs.rmSync(baselineDir, { recursive: true, force: true });
});

describe('protected emails', () => {
  it('always keeps admin and demo, and only adds from DEMO_RESET_PROTECTED', () => {
    expect(PROTECTED_EMAILS).toEqual([ADMIN, DEMO]);
    expect(resolveProtectedEmails('')).toEqual(new Set([ADMIN, DEMO]));
    expect(resolveProtectedEmails(' Extra@Example.com ,')).toEqual(
      new Set([ADMIN, DEMO, 'extra@example.com']),
    );
  });

  it('parses a comma list into lower-cased emails', () => {
    expect(parseEmails(' Lee@Example.com, ,b@x.io ')).toEqual(['lee@example.com', 'b@x.io']);
    expect(parseEmails(undefined)).toEqual([]);
  });

  it('reads the directory, users and flags from arguments before the environment', () => {
    const env = { DEMO_RESET_USERS: 'env@x.io', DEMO_BASELINE_DIR: '/env/dir' };
    expect(parseCliArgs(['/arg/dir', '--users', 'Lee@Example.com', '--dry-run'], env)).toEqual({
      dir: '/arg/dir',
      emails: ['lee@example.com'],
      includeShared: false,
      dryRun: true,
      protectedEmails: new Set([ADMIN, DEMO]),
    });
    expect(parseCliArgs(['/only/dir', '--dry-run'], env)).toMatchObject({
      dir: '/only/dir',
      emails: ['env@x.io'],
    });
    expect(parseCliArgs(['--include-shared'], env)).toMatchObject({
      dir: '/env/dir',
      emails: ['env@x.io'],
      includeShared: true,
      dryRun: false,
    });
  });
});

describe('exportBaseline', () => {
  it('skips protected accounts and never writes password hashes', async () => {
    expect(warnings.join('\n')).toContain(ADMIN);
    expect(warnings.join('\n')).toContain(DEMO);
    const users = JSON.parse(fs.readFileSync(path.join(baselineDir, 'users.json'), 'utf8'));
    expect(users.map((u) => u.email)).toEqual([LEE]);
    expect(JSON.stringify(users)).not.toContain('hash-of');
    const manifest = JSON.parse(fs.readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'));
    expect(manifest.includeShared).toBe(true);
  });

  it('writes one JSON file per account collection', () => {
    const written = fs.readdirSync(baselineDir);
    for (const { model } of ACCOUNT_COLLECTIONS) {
      expect(written).toContain(`${models[model].collection.collectionName}.json`);
    }
  });
});

describe('resetDemo', () => {
  const run = (options = {}) =>
    demoData.resetDemo({
      dir: baselineDir,
      emails: [LEE, ADMIN, DEMO],
      includeShared: false,
      dryRun: false,
      deleteFiles,
      warn,
      ...options,
    });

  it('DR1-1 leaves protected accounts exactly as they were', async () => {
    const before = await dumpProtected();
    await run({ includeShared: true });
    const after = await dumpProtected();
    expect(after).toEqual(before);
    expect(before.conversations.map((c) => c.conversationId)).toContain('admin-convo-2');
    expect(warnings.filter((w) => w.includes(ADMIN) || w.includes(DEMO)).length).toBeGreaterThan(0);
  });

  it('DR1-2 restores the target account and keeps credentials', async () => {
    const tokensBefore = await col('Token').find({}).sort({ _id: 1 }).toArray();
    const baselineConvo = JSON.parse(
      fs.readFileSync(path.join(baselineDir, 'conversations.json'), 'utf8'),
    );
    await run();

    const lee = [ids.lee, String(ids.lee)];
    const convos = await col('Conversation')
      .find({ user: { $in: lee } })
      .toArray();
    expect(convos.map((c) => c.conversationId)).toEqual(['lee-convo-1']);
    expect(convos[0].title).toBe('시나리오 대화');
    expect(String(convos[0]._id)).toBe(baselineConvo[0]._id.$oid);

    const messages = await col('Message')
      .find({ user: { $in: lee } })
      .toArray();
    expect(messages.map((m) => m.messageId)).toEqual(['lee-msg-1']);
    expect(messages[0].createdAt).toEqual(new Date('2026-09-02T00:00:00Z'));

    const files = await col('File')
      .find({ user: { $in: lee } })
      .toArray();
    expect(files.map((f) => f.file_id)).toEqual(['lee-file-1']);
    expect(deleteFiles).toHaveBeenCalledTimes(1);
    expect(deleteFiles.mock.calls[0][1].map((f) => f.file_id)).toEqual(['lee-file-2']);

    const schedules = await col('Schedule')
      .find({ user: { $in: lee } })
      .toArray();
    expect(schedules.map((s) => s.name)).toEqual(['기준 예약']);
    expect(await col('ScheduleRun').countDocuments({ user: { $in: lee } })).toBe(0);
    const skills = await col('Skill')
      .find({ author: { $in: lee } })
      .toArray();
    expect(skills.map((s) => [s.name, s.useCount])).toEqual([['baseline-skill', 3]]);
    expect(await col('SkillPack').countDocuments({ author: { $in: lee } })).toBe(0);
    expect(await col('TaskExtraction').countDocuments({ user: { $in: lee } })).toBe(0);
    expect(await col('TaskResult').countDocuments({ user: { $in: lee } })).toBe(1);

    const user = await col('User').findOne({ _id: ids.lee });
    expect(user.name).toBe('이순신');
    expect(user.department).toBe('이순신 부서');
    expect(user.organization).toBe('이순신 기관');
    expect(user.personalization).toEqual({
      memories: true,
      instructions: '이순신 지침',
      approvalMode: 'ask',
    });
    expect(user.password).toBe('changed-hash');
    expect(await col('Token').find({}).sort({ _id: 1 }).toArray()).toEqual(tokensBefore);

    expect(await col('Conversation').countDocuments({ user: String(ids.admin) })).toBe(2);
  });

  it('keeps files held by protected accounts when a reset file id is shared', async () => {
    await col('File').insertOne(makeFile(ids.admin, 'lee-file-2'));
    const deleteFilesForCli = createResetDemoFileDeleter({
      File: models.File,
      appConfig: {},
      logger,
      processDeleteRequest: async ({ files }) => {
        const fileIds = files.map(({ file_id }) => file_id);
        await col('File').deleteMany({ file_id: { $in: fileIds } });
        return { deletedFileIds: fileIds, failedFileIds: [] };
      },
      runAsSystem: (action) => action(),
    });

    await run({ deleteFiles: deleteFilesForCli });

    const protectedFile = await col('File').findOne({ user: ids.admin, file_id: 'lee-file-2' });
    const targetFile = await col('File').findOne({ user: ids.lee, file_id: 'lee-file-2' });
    expect(protectedFile).toMatchObject({ user: ids.admin, file_id: 'lee-file-2' });
    expect(targetFile).toMatchObject({ user: ids.lee, file_id: 'lee-file-2' });
  });

  it('DR1-3 leaves shared data alone unless --include-shared is given', async () => {
    await run();
    let agent = await col('Agent').findOne({ id: DEFAULT_AGENT_ID });
    expect(agent.instructions).toBe('바뀐 지시문');
    expect(agent.tools).toEqual(['a', 'b', 'c']);
    expect(await col('DeploymentSkillUsage').countDocuments()).toBe(2);

    await run({ includeShared: true });
    agent = await col('Agent').findOne({ id: DEFAULT_AGENT_ID });
    expect(agent.instructions).toBe('기준 지시문');
    expect(agent.tools).toEqual(['a', 'b']);
    expect(agent.name).toBe('업무 도우미');
    const usage = await col('DeploymentSkillUsage').find({}).toArray();
    expect(usage.map((u) => [u.name, u.useCount])).toEqual([['deployed', 5]]);
  });

  it('DR1-4 dry run reports counts and does not change the database', async () => {
    const before = await dumpAll();
    const summary = await run({ dryRun: true, includeShared: true });
    expect(await dumpAll()).toEqual(before);
    expect(deleteFiles).not.toHaveBeenCalled();

    const byName = Object.fromEntries(summary.map((row) => [row.collection, row]));
    expect(byName.conversations).toMatchObject({ email: LEE, deleted: 1, replaced: 1, created: 0 });
    expect(byName.messages).toMatchObject({ deleted: 1, replaced: 0, created: 1 });
    expect(byName.files).toMatchObject({ deleted: 1, replaced: 1 });
    expect(byName.deploymentskillusages).toMatchObject({ deleted: 1, replaced: 1 });
    expect(byName.users).toMatchObject({ email: LEE, replaced: 1 });
    expect(byName.agents).toMatchObject({ replaced: 1 });
  });

  it('skips a target account that is not in the database', async () => {
    await col('User').deleteOne({ _id: ids.lee });
    const before = await dumpAll();
    const summary = await run();
    expect(await dumpAll()).toEqual(before);
    expect(summary).toEqual([]);
    expect(warnings.join('\n')).toContain(LEE);
  });

  it('keeps metadata of files the delete service could not remove', async () => {
    deleteFiles.mockImplementationOnce(async (_user, files) => ({
      deletedFileIds: [],
      failedFileIds: files.map((f) => f.file_id),
    }));
    await run();
    const files = await col('File').find({ user: ids.lee }).sort({ file_id: 1 }).toArray();
    expect(files.map((f) => f.file_id)).toEqual(['lee-file-1', 'lee-file-2']);
    expect(warnings.join('\n')).toContain('lee-file-2');
  });
});

describe('resetDemo search index', () => {
  const PROTECTED_KEY = /^(admin|demo)-/;

  const fakeSearchIndex = () => ({
    remove: jest.fn(async () => undefined),
    add: jest.fn(async () => undefined),
  });

  const run = (options = {}) =>
    demoData.resetDemo({
      dir: baselineDir,
      emails: [LEE, ADMIN, DEMO],
      includeShared: false,
      dryRun: false,
      deleteFiles,
      warn,
      ...options,
    });

  const callsFor = (mock, model) =>
    mock.mock.calls.filter(([name]) => name === model).map(([, value]) => value);

  it('F6-1 removes deleted and restored ids, then re-adds the restored documents', async () => {
    const searchIndex = fakeSearchIndex();
    await run({ searchIndex });

    const removedConvos = callsFor(searchIndex.remove, 'Conversation').flat();
    const removedMessages = callsFor(searchIndex.remove, 'Message').flat();
    expect(removedConvos.sort()).toEqual(['lee-convo-1', 'lee-convo-2']);
    expect(removedMessages.sort()).toEqual(['lee-msg-1', 'lee-msg-2']);

    const addedConvos = callsFor(searchIndex.add, 'Conversation').flat();
    const addedMessages = callsFor(searchIndex.add, 'Message').flat();
    expect(addedConvos.map((doc) => doc.conversationId)).toEqual(['lee-convo-1']);
    expect(addedConvos[0].title).toBe('시나리오 대화');
    expect(addedMessages.map((doc) => doc.messageId)).toEqual(['lee-msg-1']);

    searchIndex.add.mock.calls.forEach(([model], i) => {
      const removeAt = searchIndex.remove.mock.calls.findIndex(([name]) => name === model);
      expect(searchIndex.remove.mock.invocationCallOrder[removeAt]).toBeLessThan(
        searchIndex.add.mock.invocationCallOrder[i],
      );
    });
  });

  it('F6-1 never sends protected account documents to the search index', async () => {
    const searchIndex = fakeSearchIndex();
    await run({ searchIndex });

    const removed = searchIndex.remove.mock.calls.flatMap(([, keys]) => keys);
    const added = searchIndex.add.mock.calls.flatMap(([, docs]) => docs);
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.filter((key) => PROTECTED_KEY.test(key))).toEqual([]);
    expect(added.map((doc) => String(doc.user))).toEqual(
      expect.not.arrayContaining([String(ids.admin), String(ids.demo)]),
    );
    const protectedConvo = await col('Conversation').findOne({ conversationId: 'admin-convo-1' });
    expect(protectedConvo._meiliIndex).toBe(true);
  });

  it('F6-1 leaves restored documents marked unindexed so a later sync picks them up', async () => {
    await run();
    const convo = await col('Conversation').findOne({ conversationId: 'lee-convo-1' });
    const message = await col('Message').findOne({ messageId: 'lee-msg-1' });
    for (const doc of [convo, message]) {
      expect(doc._meiliIndex).toBe(false);
      expect(doc).not.toHaveProperty('_meiliIndexSchemaVersion');
      expect(doc).not.toHaveProperty('_meiliIndexAttempted');
      expect(doc).not.toHaveProperty('_meiliIndexVersion');
    }
  });

  it('does not touch the search index on a dry run', async () => {
    const searchIndex = fakeSearchIndex();
    await run({ searchIndex, dryRun: true });
    expect(searchIndex.remove).not.toHaveBeenCalled();
    expect(searchIndex.add).not.toHaveBeenCalled();
  });

  it('finishes the reset and warns when the search index fails', async () => {
    const searchIndex = fakeSearchIndex();
    searchIndex.remove.mockRejectedValue(new Error('meili down'));
    await run({ searchIndex });

    const convos = await col('Conversation')
      .find({ user: String(ids.lee) })
      .toArray();
    expect(convos.map((c) => c.conversationId)).toEqual(['lee-convo-1']);
    expect(warnings.join('\n')).toContain('meili down');
    expect(searchIndex.add).not.toHaveBeenCalled();
  });
});

describe('createDemoSearchIndex', () => {
  const env = { SEARCH: 'true', MEILI_HOST: 'http://meili:7700', MEILI_MASTER_KEY: 'key' };

  const fakeClient = (status = 'succeeded') => {
    const indexes = new Map();
    const index = (uid) => {
      if (!indexes.has(uid)) {
        indexes.set(uid, { uid, deleteDocuments: jest.fn(async () => ({ taskUid: 7 })) });
      }
      return indexes.get(uid);
    };
    return { index: jest.fn(index), waitForTask: jest.fn(async () => ({ status })), indexes };
  };

  const fakeModels = () => ({
    Conversation: { processSyncBatch: jest.fn(async () => undefined) },
    Message: { processSyncBatch: jest.fn(async () => undefined) },
  });

  const build = (overrides = {}) => {
    const client = fakeClient(overrides.status);
    const models = fakeModels();
    const createClient = jest.fn(() => client);
    const searchIndex = createDemoSearchIndex({
      env,
      createClient,
      models,
      runAsSystem: (action) => action(),
      ...overrides,
    });
    return { client, models, createClient, searchIndex };
  };

  it.each([
    ['search is off', { ...env, SEARCH: 'false' }],
    ['the host is missing', { ...env, MEILI_HOST: undefined }],
    ['the key is missing', { ...env, MEILI_MASTER_KEY: undefined }],
  ])('is undefined when %s', (_label, disabledEnv) => {
    const { searchIndex, createClient } = build({ env: disabledEnv });
    expect(searchIndex).toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('deletes ids from the matching index and waits for Meilisearch', async () => {
    const { searchIndex, client, createClient } = build();
    await searchIndex.remove('Conversation', ['c1', 'c2']);
    await searchIndex.remove('Message', []);

    expect(createClient).toHaveBeenCalledWith({
      host: env.MEILI_HOST,
      apiKey: env.MEILI_MASTER_KEY,
    });
    expect(client.indexes.get('convos').deleteDocuments).toHaveBeenCalledWith(['c1', 'c2']);
    expect(client.indexes.has('messages')).toBe(false);
    expect(client.waitForTask).toHaveBeenCalledWith(7, expect.any(Object));
  });

  it('throws when Meilisearch does not finish the deletion', async () => {
    const { searchIndex } = build({ status: 'failed' });
    await expect(searchIndex.remove('Message', ['m1'])).rejects.toThrow('failed');
  });

  it('adds only documents the plugin would index', async () => {
    const { searchIndex, models, client } = build();
    const future = new Date(Date.now() + 60_000);
    const docs = [
      { conversationId: 'plain' },
      { conversationId: 'kept', isTemporary: false, expiredAt: future },
      { conversationId: 'temporary', isTemporary: true, expiredAt: future },
      { conversationId: 'legacy-expiring', expiredAt: future },
      { conversationId: 'expired', isTemporary: false, expiredAt: new Date(0) },
      { conversationId: 'subagent', subagentThread: { parentConversationId: 'plain' } },
    ];
    await searchIndex.add('Conversation', docs);
    await searchIndex.add('Message', [{ messageId: 'task', subagentTask: { id: 't' } }]);

    const [index, added] = models.Conversation.processSyncBatch.mock.calls[0];
    expect(index).toBe(client.indexes.get('convos'));
    expect(added.map((doc) => doc.conversationId)).toEqual(['plain', 'kept']);
    expect(models.Message.processSyncBatch).not.toHaveBeenCalled();
  });

  it('throws when the search plugin is not registered on the model', async () => {
    const { searchIndex } = build({ models: { Conversation: {}, Message: {} } });
    await expect(searchIndex.add('Conversation', [{ conversationId: 'c' }])).rejects.toThrow(
      'Conversation',
    );
  });
});
