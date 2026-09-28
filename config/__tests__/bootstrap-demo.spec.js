const os = require('os');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createModels, createMethods, logger } = require('@librechat/data-schemas');
const { DEFAULT_AGENT_ID, createDemoData } = require('../demo-data');

logger.silent = true;

const ADMIN = 'admin@admin.com';
const DEMO = 'demo@example.com';
const LEE = 'lee@example.com';
const PASSWORD = 'Rehearsal-Pass-1';

const ids = {
  demo: new ObjectId(),
  lee: new ObjectId(),
  agent: new ObjectId(),
};

let mongoServer;
let models;
let demoData;
let baselineDir;
let warnings;

const db = () => mongoose.connection.db;
const col = (modelName) => db().collection(models[modelName].collection.collectionName);
const warn = (message) => warnings.push(message);
const hashPassword = (password) => bcrypt.hashSync(password, 4);

/** `_id` 순서로 모든 컬렉션의 모든 문서. */
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

async function clearDatabase() {
  const collections = await db().listCollections().toArray();
  await Promise.all(collections.map(({ name }) => db().collection(name).deleteMany({})));
}

/** 서버가 기동할 때 넣는 접근 역할. 초기 적재 스크립트는 서버가 뜬 뒤에 실행한다. */
async function seedAccessRoles() {
  await createMethods(mongoose).seedDefaultRoles();
}

const roleId = async (accessRoleId) => (await col('AccessRole').findOne({ accessRoleId }))._id;

/** 시연 DB: 기본 agent 를 demo 계정이 만들어 전체 공개했고, 이협력 계정에 시연 대화가 있다. */
async function seedDemoDatabase() {
  await seedAccessRoles();
  await col('User').insertMany([
    {
      _id: ids.demo,
      email: DEMO,
      name: '홍길동',
      role: 'USER',
      provider: 'local',
      password: 'demo-hash',
    },
    {
      _id: ids.lee,
      email: LEE,
      name: '이협력',
      role: 'USER',
      provider: 'local',
      password: 'lee-hash',
      department: '교류협력팀',
      organization: '통일부',
    },
  ]);
  await col('Conversation').insertOne({
    _id: new ObjectId(),
    conversationId: 'lee-convo-1',
    user: String(ids.lee),
    title: '시연 대화',
    endpoint: 'agents',
  });
  await col('Message').insertOne({
    _id: new ObjectId(),
    messageId: 'lee-msg-1',
    conversationId: 'lee-convo-1',
    user: String(ids.lee),
    text: '시연 메시지',
    isCreatedByUser: true,
  });
  await col('Agent').insertOne({
    _id: ids.agent,
    id: DEFAULT_AGENT_ID,
    name: '업무 도우미',
    description: '일반 업무 질문에 답한다',
    author: ids.demo,
    instructions: '기준 지시문',
    tools: ['a', 'b'],
    provider: 'openAI',
    model: 'gpt',
    skills_enabled: true,
    conversation_starters: ['공유 폴더에 어떤 문서들이 있는지 알려 줘'],
    versions: [
      { name: '업무 도우미', tools: ['a'] },
      { name: '업무 도우미', tools: ['a', 'b'], updatedBy: ids.demo },
    ],
  });
  const grantedBy = ids.demo;
  await col('AclEntry').insertMany([
    {
      _id: new ObjectId(),
      principalType: 'user',
      principalId: ids.demo,
      principalModel: 'User',
      resourceType: 'agent',
      resourceId: ids.agent,
      permBits: 15,
      roleId: await roleId('agent_owner'),
      grantedBy,
    },
    {
      _id: new ObjectId(),
      principalType: 'user',
      principalId: ids.demo,
      principalModel: 'User',
      resourceType: 'remoteAgent',
      resourceId: ids.agent,
      permBits: 15,
      roleId: await roleId('remoteAgent_owner'),
      grantedBy,
    },
    {
      _id: new ObjectId(),
      principalType: 'public',
      resourceType: 'agent',
      resourceId: ids.agent,
      permBits: 1,
      roleId: await roleId('agent_viewer'),
      grantedBy,
    },
    {
      _id: new ObjectId(),
      principalType: 'public',
      resourceType: 'skill',
      resourceId: new ObjectId(),
      permBits: 1,
      roleId: await roleId('skill_viewer'),
      grantedBy,
    },
  ]);
  await col('DeploymentSkillUsage').insertOne({
    _id: new ObjectId(),
    skillId: new ObjectId(),
    name: 'polish',
    useCount: 26,
  });
  await col('Token').insertOne({ _id: new ObjectId(), userId: ids.lee, token: 'login-token' });
}

function writeAdminProfile(dir) {
  fs.writeFileSync(
    path.join(dir, 'bootstrap.json'),
    JSON.stringify({
      admin: {
        name: '홍길동',
        username: 'admin',
        department: '정세분석팀',
        organization: '통일부',
      },
    }),
  );
}

const readBaseline = (file) => JSON.parse(fs.readFileSync(path.join(baselineDir, file), 'utf8'));

const bootstrap = (overrides = {}) =>
  demoData.bootstrapDemo({
    dir: baselineDir,
    adminEmail: ADMIN,
    password: PASSWORD,
    hashPassword,
    deleteFiles: async () => ({ failedFileIds: [] }),
    warn,
    ...overrides,
  });

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
  await clearDatabase();
  await seedDemoDatabase();
  baselineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-bootstrap-'));
  await demoData.exportBaseline({ dir: baselineDir, emails: [LEE], includeShared: true, warn });
  writeAdminProfile(baselineDir);
});

afterEach(() => {
  fs.rmSync(baselineDir, { recursive: true, force: true });
});

describe('exportBaseline with --include-shared', () => {
  it('writes the whole default agent without the ids of the account that made it', () => {
    const [agent] = readBaseline('agents.json');
    expect(agent).toMatchObject({
      _id: { $oid: String(ids.agent) },
      id: DEFAULT_AGENT_ID,
      name: '업무 도우미',
      provider: 'openAI',
      model: 'gpt',
      skills_enabled: true,
      conversation_starters: ['공유 폴더에 어떤 문서들이 있는지 알려 줘'],
    });
    expect(agent).not.toHaveProperty('author');
    expect(agent.versions).toHaveLength(2);
    expect(JSON.stringify(agent)).not.toContain(String(ids.demo));
  });

  it('writes only the public grants on the default agent, without who granted them', () => {
    const grants = readBaseline('aclentries.json');
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      principalType: 'public',
      resourceType: 'agent',
      resourceId: { $oid: String(ids.agent) },
      permBits: { $numberInt: '1' },
      accessRoleId: 'agent_viewer',
    });
    expect(grants[0]).not.toHaveProperty('roleId');
    expect(JSON.stringify(grants)).not.toContain(String(ids.demo));
  });
});

describe('bootstrapDemo on an empty database', () => {
  beforeEach(async () => {
    await clearDatabase();
    await seedAccessRoles();
  });

  it('creates the admin account from the given email and password', async () => {
    await bootstrap();
    const admin = await col('User').findOne({ email: ADMIN });
    expect(admin).toMatchObject({
      role: 'ADMIN',
      provider: 'local',
      emailVerified: true,
      termsAccepted: true,
      name: '홍길동',
      username: 'admin',
      department: '정세분석팀',
      organization: '통일부',
    });
    expect(bcrypt.compareSync(PASSWORD, admin.password)).toBe(true);
  });

  it('creates the baseline accounts with their ids and restores their data', async () => {
    await bootstrap();
    const lee = await col('User').findOne({ email: LEE });
    expect(String(lee._id)).toBe(String(ids.lee));
    expect(lee).toMatchObject({ role: 'USER', name: '이협력', department: '교류협력팀' });
    expect(bcrypt.compareSync(PASSWORD, lee.password)).toBe(true);
    expect(
      await col('Conversation')
        .find({ user: String(ids.lee) })
        .toArray(),
    ).toEqual([expect.objectContaining({ conversationId: 'lee-convo-1', title: '시연 대화' })]);
    expect(await col('Message').countDocuments({ user: String(ids.lee) })).toBe(1);
    expect(await col('Token').countDocuments({})).toBe(0);
  });

  it('adds the default agent with its ids, owned by the admin and shared with everyone', async () => {
    await bootstrap();
    const admin = await col('User').findOne({ email: ADMIN });
    const agent = await col('Agent').findOne({ id: DEFAULT_AGENT_ID });
    expect(String(agent._id)).toBe(String(ids.agent));
    expect(String(agent.author)).toBe(String(admin._id));
    expect(agent).toMatchObject({ name: '업무 도우미', tools: ['a', 'b'], skills_enabled: true });

    const grants = await col('AclEntry')
      .find({ resourceId: ids.agent }, { projection: { _id: 0, createdAt: 0, updatedAt: 0 } })
      .sort({ resourceType: 1, principalType: 1 })
      .toArray();
    expect(grants).toEqual([
      expect.objectContaining({
        principalType: 'public',
        resourceType: 'agent',
        permBits: 1,
        roleId: await roleId('agent_viewer'),
      }),
      expect.objectContaining({
        principalType: 'user',
        principalId: admin._id,
        resourceType: 'agent',
        permBits: 15,
        roleId: await roleId('agent_owner'),
      }),
      expect.objectContaining({
        principalType: 'user',
        principalId: admin._id,
        resourceType: 'remoteAgent',
        permBits: 15,
        roleId: await roleId('remoteAgent_owner'),
      }),
    ]);
  });

  it('adds the deployment skill usage counts', async () => {
    await bootstrap();
    expect(await col('DeploymentSkillUsage').find({}).toArray()).toEqual([
      expect.objectContaining({ name: 'polish', useCount: 26 }),
    ]);
  });

  it('changes nothing when run a second time', async () => {
    await bootstrap();
    const first = await dumpAll();
    await bootstrap();
    expect(await dumpAll()).toEqual(first);
  });

  it('needs no password once the accounts exist', async () => {
    await bootstrap();
    const first = await dumpAll();
    await bootstrap({ password: undefined });
    expect(await dumpAll()).toEqual(first);
  });

  it('refuses to create accounts without a password', async () => {
    await expect(bootstrap({ password: undefined })).rejects.toThrow(/password/i);
    expect(await col('User').countDocuments({})).toBe(0);
  });

  it('refuses to run before the server has seeded the access roles', async () => {
    await clearDatabase();
    await expect(bootstrap()).rejects.toThrow(/access role/i);
    expect(await col('User').countDocuments({})).toBe(0);
  });

  it('refuses a baseline exported without --include-shared', async () => {
    await demoData.exportBaseline({ dir: baselineDir, emails: [LEE], warn });
    await expect(bootstrap()).rejects.toThrow(/include-shared/);
  });
});

describe('bootstrapDemo on a database that already has the demo', () => {
  it('leaves existing accounts, their data and the agent as they are', async () => {
    await col('Conversation').insertOne({
      _id: new ObjectId(),
      conversationId: 'lee-convo-2',
      user: String(ids.lee),
      title: '시연 뒤 새 대화',
    });
    await col('Agent').updateOne(
      { id: DEFAULT_AGENT_ID },
      { $set: { instructions: '바뀐 지시문' } },
    );
    await col('User').insertOne({
      _id: new ObjectId(),
      email: ADMIN,
      name: '관리자',
      role: 'ADMIN',
      provider: 'local',
      password: 'admin-hash',
    });
    const before = await dumpAll();

    await bootstrap();

    expect(await dumpAll()).toEqual(before);
  });
});
