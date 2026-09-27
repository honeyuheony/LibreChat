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

const PREFIX = 'department:';

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
  idOnTheSource?: string,
): Promise<t.IUser & { _id: mongoose.Types.ObjectId }> {
  return (await User.create({
    name,
    email: `${name}@example.com`,
    provider: 'local',
    ...(department !== undefined && { department }),
    ...(idOnTheSource !== undefined && { idOnTheSource }),
  })) as t.IUser & { _id: mongoose.Types.ObjectId };
}

describe('setGroupMembersByDepartment', () => {
  test('creates the local group with every user of the department as members', async () => {
    const a = await createUser('a', '정세분석팀');
    await createUser('b', ' 정세분석팀 ', 'entra-b');
    await createUser('c', '운영지원팀');
    await createUser('d');

    const group = await methods.setGroupMembersByDepartment({
      idOnTheSource: `${PREFIX}정세분석팀`,
      department: '정세분석팀',
    });

    expect(group?.source).toBe('local');
    expect(group?.name).toBe('정세분석팀');
    expect(group?.idOnTheSource).toBe(`${PREFIX}정세분석팀`);
    expect([...(group?.memberIds ?? [])].sort()).toEqual([a._id.toString(), 'entra-b'].sort());
    expect(await Group.countDocuments()).toBe(1);
  });

  test('drops members who left the department on the next sync', async () => {
    const a = await createUser('a', '정세분석팀');
    const b = await createUser('b', '정세분석팀');
    const key = `${PREFIX}정세분석팀`;
    await methods.setGroupMembersByDepartment({ idOnTheSource: key, department: '정세분석팀' });

    await User.updateOne({ _id: b._id }, { $set: { department: '운영지원팀' } });
    const group = await methods.setGroupMembersByDepartment({
      idOnTheSource: key,
      department: '정세분석팀',
    });

    expect(group?.memberIds).toEqual([a._id.toString()]);
  });

  test('does not match a department that only shares a prefix', async () => {
    await createUser('a', '정세분석팀2');
    const group = await methods.setGroupMembersByDepartment({
      idOnTheSource: `${PREFIX}정세분석팀`,
      department: '정세분석팀',
    });
    expect(group?.memberIds).toEqual([]);
  });
});

describe('syncUserLocalGroupMembership', () => {
  test('adds the user to the target group, creating it once', async () => {
    const a = await createUser('a', '정세분석팀');
    const target = { idOnTheSource: `${PREFIX}정세분석팀`, name: '정세분석팀' };

    const first = await methods.syncUserLocalGroupMembership({
      userId: a._id,
      prefix: PREFIX,
      target,
    });
    const second = await methods.syncUserLocalGroupMembership({
      userId: a._id,
      prefix: PREFIX,
      target,
    });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    const groups = await Group.find({}).lean();
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds).toEqual([a._id.toString()]);
    expect(first.groupId).toBe(groups[0]._id.toString());
  });

  test('moves the user out of other prefixed groups but keeps hand-made groups', async () => {
    const a = await createUser('a', '운영지원팀');
    const member = a._id.toString();
    const old = await Group.create({
      name: '정세분석팀',
      source: 'local',
      idOnTheSource: `${PREFIX}정세분석팀`,
      memberIds: [member, 'someone-else'],
    });
    const manual = await Group.create({ name: '정세분석팀', source: 'local', memberIds: [member] });
    const entra = await Group.create({
      name: 'department:운영지원팀',
      source: 'entra',
      idOnTheSource: `${PREFIX}운영지원팀`,
      memberIds: [member],
    });

    const result = await methods.syncUserLocalGroupMembership({
      userId: a._id,
      prefix: PREFIX,
      target: { idOnTheSource: `${PREFIX}운영지원팀`, name: '운영지원팀' },
    });

    expect(result.changed).toBe(true);
    expect((await Group.findById(old._id).lean())?.memberIds).toEqual(['someone-else']);
    expect((await Group.findById(manual._id).lean())?.memberIds).toEqual([member]);
    expect((await Group.findById(entra._id).lean())?.memberIds).toEqual([member]);
    const target = await Group.findOne({
      source: 'local',
      idOnTheSource: `${PREFIX}운영지원팀`,
    }).lean();
    expect(target?.memberIds).toEqual([member]);
  });

  test('leaves every prefixed group when the user has no department', async () => {
    const a = await createUser('a');
    const old = await Group.create({
      name: '정세분석팀',
      source: 'local',
      idOnTheSource: `${PREFIX}정세분석팀`,
      memberIds: [a._id.toString()],
    });

    const result = await methods.syncUserLocalGroupMembership({
      userId: a._id,
      prefix: PREFIX,
      target: null,
    });

    expect(result).toEqual({ changed: true });
    expect((await Group.findById(old._id).lean())?.memberIds).toEqual([]);
    expect(await Group.countDocuments()).toBe(1);
  });

  test('stores the external member key for external users', async () => {
    const a = await createUser('a', '정세분석팀', 'entra-a');
    await methods.syncUserLocalGroupMembership({
      userId: a._id,
      idOnTheSource: 'entra-a',
      prefix: PREFIX,
      target: { idOnTheSource: `${PREFIX}정세분석팀`, name: '정세분석팀' },
    });
    const group = await Group.findOne({ idOnTheSource: `${PREFIX}정세분석팀` }).lean();
    expect(group?.memberIds).toEqual(['entra-a']);
  });

  test('makes the user a principal of the target group', async () => {
    const a = await createUser('a', '정세분석팀');
    const { groupId } = await methods.syncUserLocalGroupMembership({
      userId: a._id,
      prefix: PREFIX,
      target: { idOnTheSource: `${PREFIX}정세분석팀`, name: '정세분석팀' },
    });
    const principals = await methods.getUserPrincipals({ userId: a._id, role: null });
    const groupIds = principals
      .filter((p) => p.principalType === PrincipalType.GROUP)
      .map((p) => p.principalId?.toString());
    expect(groupIds).toEqual([groupId]);
    expect(typeof groupId).toBe('string');
  });
});

describe('findLocalGroupIdsByPrefix', () => {
  test('returns only local groups whose external id starts with the prefix', async () => {
    const dept = await Group.create({
      name: '정세분석팀',
      source: 'local',
      idOnTheSource: `${PREFIX}정세분석팀`,
    });
    await Group.create({ name: 'manual', source: 'local' });
    await Group.create({ name: 'x', source: 'local', idOnTheSource: `x${PREFIX}정세분석팀` });
    await Group.create({ name: 'e', source: 'entra', idOnTheSource: `${PREFIX}운영지원팀` });

    const ids = await methods.findLocalGroupIdsByPrefix(PREFIX);
    expect(ids.map((id) => id.toString())).toEqual([dept._id.toString()]);
  });
});
