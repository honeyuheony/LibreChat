import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PermissionBits, PrincipalType, ResourceType } from 'librechat-data-provider';
import type * as t from '~/types';
import { createUserGroupMethods } from './userGroup';
import aclEntrySchema from '~/schema/aclEntry';
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
let AclEntry: mongoose.Model<t.IAclEntry>;
let methods: ReturnType<typeof createUserGroupMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  Group = mongoose.models.Group || mongoose.model<t.IGroup>('Group', groupSchema);
  User = mongoose.models.User || mongoose.model<t.IUser>('User', userSchema);
  AclEntry = mongoose.models.AclEntry || mongoose.model<t.IAclEntry>('AclEntry', aclEntrySchema);
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

describe('department groups stay out of principal search', () => {
  test('searchPrincipals and findGroupsByNamePattern skip department groups', async () => {
    await methods.ensureDepartmentGroup('정세분석팀');
    const manual = await Group.create({ name: '정세분석팀 공부모임', source: 'local' });

    const search = await methods.searchPrincipals('정세', 10, [PrincipalType.GROUP]);
    expect(search.map((result) => result.id)).toEqual([manual._id.toString()]);
    const byName = await methods.findGroupsByNamePattern('정세');
    expect(byName.map((group) => group._id.toString())).toEqual([manual._id.toString()]);
  });

  test('isDepartmentGroup tells department groups from other groups', async () => {
    const id = await methods.ensureDepartmentGroup('정세분석팀');
    const manual = await Group.create({ name: 'manual', source: 'local' });

    expect(await methods.isDepartmentGroup(id)).toBe(true);
    expect(await methods.isDepartmentGroup(manual._id.toString())).toBe(false);
    expect(await methods.isDepartmentGroup('not-an-id')).toBe(false);
  });
});

describe('findDepartmentGrants', () => {
  test('names the department of every department group grant with the permission', async () => {
    const policy = await methods.ensureDepartmentGroup('정세분석팀');
    const support = await methods.ensureDepartmentGroup('운영지원팀');
    const manual = await Group.create({ name: 'manual', source: 'local' });
    const [a, b, c, d] = [0, 1, 2, 3].map(() => new mongoose.Types.ObjectId());
    const grant = (principalId: unknown, resourceId: unknown, permBits: number) =>
      AclEntry.create({
        principalType: PrincipalType.GROUP,
        principalId,
        principalModel: 'Group',
        resourceType: ResourceType.SKILL,
        resourceId,
        permBits,
      });
    await grant(new mongoose.Types.ObjectId(policy), a, PermissionBits.VIEW);
    await grant(new mongoose.Types.ObjectId(support), b, PermissionBits.VIEW | PermissionBits.EDIT);
    await grant(manual._id, c, PermissionBits.VIEW);
    await grant(new mongoose.Types.ObjectId(policy), d, PermissionBits.EDIT);

    const grants = await methods.findDepartmentGrants(
      ResourceType.SKILL,
      [a, b, c, d],
      PermissionBits.VIEW,
    );
    expect(grants.sort((x, y) => x.department.localeCompare(y.department))).toEqual(
      [
        { resourceId: b.toString(), department: '운영지원팀' },
        { resourceId: a.toString(), department: '정세분석팀' },
      ].sort((x, y) => x.department.localeCompare(y.department)),
    );
  });
});
