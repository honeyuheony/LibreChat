import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, createMethods, tenantStorage } from '@librechat/data-schemas';
import { PermissionBits, PrincipalType, ResourceType } from 'librechat-data-provider';
import type { AllMethods, IUser } from '@librechat/data-schemas';
import { createDepartmentGroups, departmentGroupKey } from './department';

const tenantId = 'department-test';
let server: MongoMemoryServer;
let db: AllMethods;
const inTenant = <T>(fn: () => Promise<T>) => tenantStorage.run({ tenantId }, fn);

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
  createModels(mongoose);
  db = createMethods(mongoose);
});
afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
});
beforeEach(async () => {
  await mongoose.models.User.deleteMany({});
  await mongoose.models.Group.deleteMany({});
  await mongoose.models.AclEntry.deleteMany({});
});

async function createUser(name: string, department?: string): Promise<IUser> {
  const doc = await mongoose.models.User.create({
    name,
    email: `${name}@example.com`,
    provider: 'local',
    tenantId,
    ...(department !== undefined && { department }),
  });
  return doc.toObject() as IUser;
}

function groupsRaw() {
  return mongoose.models.Group.collection.find({}).toArray();
}

describe('departmentGroupKey', () => {
  it('keys the local group by the department name', () => {
    expect(departmentGroupKey('정세분석팀')).toBe('department:정세분석팀');
  });
});

describe('syncUser', () => {
  it('puts the user in the tenant group of their department', async () => {
    const user = await createUser('a', '정세분석팀');
    await createDepartmentGroups(db).syncUser(user);

    const groups = await groupsRaw();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      name: '정세분석팀',
      source: 'local',
      idOnTheSource: 'department:정세분석팀',
      tenantId,
      memberIds: [user._id.toString()],
    });
  });

  it('creates no group for a user without a department', async () => {
    const user = await createUser('a', '  ');
    await createDepartmentGroups(db).syncUser(user);
    expect(await groupsRaw()).toHaveLength(0);
  });

  it('moves the user to the new group when the department changes', async () => {
    const user = await createUser('a', '정세분석팀');
    const groups = createDepartmentGroups(db);
    await groups.syncUser(user);
    await groups.syncUser({ ...user, department: '운영지원팀' });

    const byKey = new Map((await groupsRaw()).map((group) => [group.idOnTheSource, group]));
    expect(byKey.get('department:정세분석팀')?.memberIds).toEqual([]);
    expect(byKey.get('department:운영지원팀')?.memberIds).toEqual([user._id.toString()]);
  });
});

describe('syncDepartment', () => {
  it('returns the group id with every user of the department as members', async () => {
    const a = await createUser('a', '정세분석팀');
    const b = await createUser('b', '정세분석팀');
    await createUser('c', '운영지원팀');

    const groupId = await inTenant(() => createDepartmentGroups(db).syncDepartment('정세분석팀'));

    const groups = await groupsRaw();
    expect(groups).toHaveLength(1);
    expect(groupId).toBe(groups[0]._id.toString());
    expect([...groups[0].memberIds].sort()).toEqual([a._id.toString(), b._id.toString()].sort());
  });
});

describe('findSharedResourceIds', () => {
  it('returns only the resources granted to a department group', async () => {
    const owner = await createUser('a', '정세분석팀');
    const groups = createDepartmentGroups(db);
    const teamSkill = new Types.ObjectId();
    const publicSkill = new Types.ObjectId();
    const otherSkill = new Types.ObjectId();

    const shared = await inTenant(async () => {
      const groupId = await groups.syncDepartment('정세분석팀');
      const manual = await db.createGroup({ name: '정세분석팀', source: 'local' });
      await db.grantPermission(
        PrincipalType.GROUP,
        new Types.ObjectId(groupId as string),
        ResourceType.SKILL,
        teamSkill,
        PermissionBits.VIEW,
        owner._id,
      );
      await db.grantPermission(
        PrincipalType.PUBLIC,
        null,
        ResourceType.SKILL,
        publicSkill,
        PermissionBits.VIEW,
        owner._id,
      );
      await db.grantPermission(
        PrincipalType.GROUP,
        manual._id,
        ResourceType.SKILL,
        otherSkill,
        PermissionBits.VIEW,
        owner._id,
      );
      return groups.findSharedResourceIds(ResourceType.SKILL, [teamSkill, publicSkill, otherSkill]);
    });

    expect([...shared]).toEqual([teamSkill.toString()]);
  });

  it('returns nothing when no department group exists', async () => {
    const shared = await createDepartmentGroups(db).findSharedResourceIds(ResourceType.SKILL, [
      new Types.ObjectId(),
    ]);
    expect(shared.size).toBe(0);
  });
});
