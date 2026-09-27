import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels, createMethods, tenantStorage } from '@librechat/data-schemas';
import { PermissionBits, PrincipalType, ResourceType } from 'librechat-data-provider';
import type { AllMethods } from '@librechat/data-schemas';
import { createDepartmentGroups } from './department';

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
  await mongoose.models.Group.deleteMany({});
  await mongoose.models.AclEntry.deleteMany({});
});

function grantView(principalType: string, principalId: Types.ObjectId | null, id: Types.ObjectId) {
  return db.grantPermission(
    principalType,
    principalId,
    ResourceType.SKILL,
    id,
    PermissionBits.VIEW,
  );
}

describe('ensureGroup', () => {
  it('creates the department group in the tenant of the request', async () => {
    const groupId = await inTenant(() => createDepartmentGroups(db).ensureGroup('정세분석팀'));
    const groups = await mongoose.models.Group.collection.find({}).toArray();
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      name: '정세분석팀',
      source: 'local',
      idOnTheSource: 'department:정세분석팀',
      tenantId,
    });
    expect(groups[0]._id.toString()).toBe(groupId);
  });
});

describe('findTeamDepartments', () => {
  it('names the department group each resource was granted to', async () => {
    const groups = createDepartmentGroups(db);
    const policyTeam = new Types.ObjectId();
    const supportTeam = new Types.ObjectId();
    const publicOnly = new Types.ObjectId();

    const departments = await inTenant(async () => {
      const policy = new Types.ObjectId(await groups.ensureGroup('정세분석팀'));
      const support = new Types.ObjectId(await groups.ensureGroup('운영지원팀'));
      await grantView(PrincipalType.GROUP, policy, policyTeam);
      await grantView(PrincipalType.GROUP, support, supportTeam);
      await grantView(PrincipalType.PUBLIC, null, publicOnly);
      return groups.findTeamDepartments(ResourceType.SKILL, [policyTeam, supportTeam, publicOnly]);
    });

    expect(Object.fromEntries(departments)).toEqual({
      [policyTeam.toString()]: '정세분석팀',
      [supportTeam.toString()]: '운영지원팀',
    });
  });

  it('returns nothing when no department group exists', async () => {
    const departments = await inTenant(() =>
      createDepartmentGroups(db).findTeamDepartments(ResourceType.SKILL, [new Types.ObjectId()]),
    );
    expect(departments.size).toBe(0);
  });
});

describe('findGroupIds', () => {
  it('lists every department group id', async () => {
    const groups = createDepartmentGroups(db);
    const ids = await inTenant(async () => [
      await groups.ensureGroup('정세분석팀'),
      await groups.ensureGroup('운영지원팀'),
    ]);
    const found = await inTenant(() => groups.findGroupIds());
    expect([...found].sort()).toEqual([...ids].sort());
  });
});
