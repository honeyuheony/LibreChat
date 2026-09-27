import mongoose from 'mongoose';
import { PrincipalType } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type * as t from '~/types';
import { createUserGroupMethods } from './userGroup';
import groupSchema from '~/schema/group';
import userSchema from '~/schema/user';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let Group: mongoose.Model<t.IGroup>;
let User: mongoose.Model<t.IUser>;
let methods: ReturnType<typeof createUserGroupMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  Group = mongoose.models.Group || mongoose.model<t.IGroup>('Group', groupSchema);
  User = mongoose.models.User || mongoose.model<t.IUser>('User', userSchema);
  methods = createUserGroupMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function createUser(
  name: string,
  department?: string,
): Promise<t.IUser & { _id: mongoose.Types.ObjectId }> {
  return (await User.create({
    name,
    email: `${name}@example.com`,
    provider: 'local',
    ...(department !== undefined && { department }),
  })) as t.IUser & { _id: mongoose.Types.ObjectId };
}

function groupIdsOf(principals: Array<{ principalType: string; principalId?: unknown }>) {
  return principals
    .filter((principal) => principal.principalType === PrincipalType.GROUP)
    .map((principal) => String(principal.principalId));
}

function createMapCache(): t.CacheStore {
  const store = new Map<string, unknown>();
  return {
    get: async (key) => store.get(key),
    set: async (key, value) => store.set(key, value),
    delete: async (key) => store.delete(key),
    clear: async () => store.clear(),
  };
}

describe('ensureDepartmentGroup', () => {
  test('creates one local group per department without members', async () => {
    const first = await methods.ensureDepartmentGroup(' 정세분석팀 ');
    const second = await methods.ensureDepartmentGroup('정세분석팀');

    expect(second).toBe(first);
    const groups = await Group.find({}).lean();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      name: '정세분석팀',
      source: 'local',
      idOnTheSource: 'department:정세분석팀',
      memberIds: [],
    });
    expect(groups[0]._id.toString()).toBe(first);
  });

  test('refuses a blank department', async () => {
    await expect(methods.ensureDepartmentGroup('  ')).rejects.toThrow('department is required');
    expect(await Group.countDocuments()).toBe(0);
  });
});

describe('findDepartmentGroupIds', () => {
  test('maps each department that has a group to its group id', async () => {
    const id = await methods.ensureDepartmentGroup('정세분석팀');
    await Group.create({ name: '운영지원팀', source: 'local' });

    expect(await methods.findDepartmentGroupIds(['정세분석팀', '운영지원팀'])).toEqual({
      정세분석팀: id,
    });
  });
});

describe('listDepartmentGroupIds', () => {
  test('returns only local groups keyed as departments', async () => {
    const id = await methods.ensureDepartmentGroup('정세분석팀');
    await Group.create({ name: 'manual', source: 'local' });
    await Group.create({ name: 'x', source: 'local', idOnTheSource: 'xdepartment:정세분석팀' });
    await Group.create({ name: 'e', source: 'entra', idOnTheSource: 'department:운영지원팀' });

    const ids = await methods.listDepartmentGroupIds();
    expect(ids.map((groupId) => groupId.toString())).toEqual([id]);
  });
});

describe('getUserPrincipals with department groups', () => {
  test('adds the group of the department stored on the user', async () => {
    const user = await createUser('a', '정세분석팀');
    const id = await methods.ensureDepartmentGroup('정세분석팀');
    await methods.ensureDepartmentGroup('운영지원팀');

    const principals = await methods.getUserPrincipals({ userId: user._id, role: null });
    expect(groupIdsOf(principals)).toEqual([id]);
  });

  test('follows a department change at once, even with a warm membership cache', async () => {
    const cached = createUserGroupMethods(mongoose, { getCache: () => createMapCache() });
    const user = await createUser('a', '정세분석팀');
    await cached.ensureDepartmentGroup('정세분석팀');
    const next = await cached.ensureDepartmentGroup('운영지원팀');
    await cached.getUserPrincipals({ userId: user._id, role: null });

    await User.updateOne({ _id: user._id }, { $set: { department: '운영지원팀' } });
    const principals = await cached.getUserPrincipals({ userId: user._id, role: null });

    expect(groupIdsOf(principals)).toEqual([next]);
  });

  test('reads the department even when the caller passes role and idOnTheSource', async () => {
    const user = await createUser('a', '정세분석팀');
    const id = await methods.ensureDepartmentGroup('정세분석팀');

    const principals = await methods.getUserPrincipals({
      userId: user._id,
      role: 'USER',
      idOnTheSource: null,
    });
    expect(groupIdsOf(principals)).toEqual([id]);
  });

  test('adds no department group for a user without a department', async () => {
    const user = await createUser('a');
    await methods.ensureDepartmentGroup('정세분석팀');

    const principals = await methods.getUserPrincipals({ userId: user._id, role: null });
    expect(groupIdsOf(principals)).toEqual([]);
  });

  test('ignores members written into a department group by hand', async () => {
    const user = await createUser('a', '운영지원팀');
    const id = await methods.ensureDepartmentGroup('정세분석팀');
    await Group.updateOne({ _id: id }, { $addToSet: { memberIds: user._id.toString() } });

    const principals = await methods.getUserPrincipals({ userId: user._id, role: null });
    expect(groupIdsOf(principals)).toEqual([]);
  });

  test('keeps ordinary group memberships next to the department group', async () => {
    const user = await createUser('a', '정세분석팀');
    const id = await methods.ensureDepartmentGroup('정세분석팀');
    const manual = await Group.create({
      name: 'manual',
      source: 'local',
      memberIds: [user._id.toString()],
    });

    const principals = await methods.getUserPrincipals({ userId: user._id, role: null });
    expect(groupIdsOf(principals).sort()).toEqual([id, manual._id.toString()].sort());
  });
});
