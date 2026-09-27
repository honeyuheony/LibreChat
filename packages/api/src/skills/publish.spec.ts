import { Types } from 'mongoose';
import { AccessRoleIds, PrincipalType, ResourceType } from 'librechat-data-provider';
import type { NextFunction, Response } from 'express';
import type { ISkill } from '@librechat/data-schemas';
import type { SkillPublishDeps, SkillTestResultDeps, SkillSharePolicy } from './publish';
import type { ServerRequest } from '~/types';
import { createSkillPublishHandler, createSkillTestResultHandler } from './publish';

type SkillDoc = ISkill & { _id: Types.ObjectId };

const USER_ID = new Types.ObjectId().toString();
const SKILL_ID = new Types.ObjectId();
const USER_MESSAGE_AT = new Date('2026-09-27T01:00:00.000Z');
const RESPONSE_DONE_AT = new Date('2026-09-27T01:00:42.500Z');

function createResponse() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function createSkill(overrides: Partial<SkillDoc> = {}): SkillDoc {
  return {
    _id: SKILL_ID,
    name: 'weekly-report',
    displayTitle: '주간 보고서',
    description: '주간 회의록을 보고서로 정리한다.',
    body: '# 주간 보고서\n\n1. 결정 사항을 적는다.',
    author: new Types.ObjectId(USER_ID),
    authorName: 'Owner',
    version: 4,
    source: 'inline',
    fileCount: 0,
    manualMinutes: 30,
    createdAt: new Date('2026-09-26T00:00:00.000Z'),
    updatedAt: new Date('2026-09-26T00:00:00.000Z'),
    ...overrides,
  } as SkillDoc;
}

function createRequest(skill: SkillDoc | null, body: unknown): ServerRequest {
  return {
    user: { id: USER_ID, _id: new Types.ObjectId(USER_ID), role: 'USER' },
    params: { id: SKILL_ID.toString() },
    body,
    resourceAccess: skill ? { resourceInfo: skill } : undefined,
  } as unknown as ServerRequest;
}

function testMessages(
  overrides: {
    manualSkills?: string[];
    response?: Record<string, unknown> | null;
  } = {},
) {
  const userMessage = {
    messageId: 'user-msg',
    parentMessageId: '00000000-0000-0000-0000-000000000000',
    isCreatedByUser: true,
    manualSkills: overrides.manualSkills ?? ['weekly-report'],
    createdAt: USER_MESSAGE_AT,
    updatedAt: USER_MESSAGE_AT,
  };
  if (overrides.response === null) {
    return [userMessage];
  }
  return [
    userMessage,
    {
      messageId: 'response-msg',
      parentMessageId: 'user-msg',
      isCreatedByUser: false,
      error: false,
      unfinished: false,
      createdAt: new Date('2026-09-27T01:00:01.000Z'),
      updatedAt: RESPONSE_DONE_AT,
      ...overrides.response,
    },
  ];
}

describe('createSkillTestResultHandler', () => {
  function createDeps(overrides: Partial<SkillTestResultDeps> = {}) {
    return {
      getSkillById: jest.fn(async () => null),
      getConvo: jest.fn(async () => ({ conversationId: 'convo-1' })),
      getMessages: jest.fn(async () => testMessages()),
      hasPublicPermission: jest.fn(async () => false),
      setSkillPublicationState: jest.fn(async ({ lastTest }) => ({
        status: 'updated' as const,
        skill: createSkill({ lastTest }),
      })),
      ...overrides,
    } as SkillTestResultDeps & {
      getConvo: jest.Mock;
      getMessages: jest.Mock;
      setSkillPublicationState: jest.Mock;
    };
  }

  async function run(deps: SkillTestResultDeps, body: unknown, skill = createSkill()) {
    const res = createResponse();
    await createSkillTestResultHandler(deps)(
      createRequest(skill, body),
      res as unknown as Response,
    );
    return res;
  }

  it.each([
    ['missing conversation id', { version: 4 }],
    ['blank conversation id', { conversationId: '', version: 4 }],
    ['non-integer version', { conversationId: 'convo-1', version: 4.5 }],
    ['string version', { conversationId: 'convo-1', version: '4' }],
  ])('rejects %s with 400', async (_label, body) => {
    const deps = createDeps();
    const res = await run(deps, body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(deps.setSkillPublicationState).not.toHaveBeenCalled();
  });

  it('rejects a version that is not the stored version with 409', async () => {
    const deps = createDeps();
    const res = await run(deps, { conversationId: 'convo-1', version: 3 });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'skill_version_conflict',
      current: expect.objectContaining({ version: 4 }),
    });
    expect(deps.getConvo).not.toHaveBeenCalled();
    expect(deps.setSkillPublicationState).not.toHaveBeenCalled();
  });

  it('rejects a conversation the caller does not own with 404', async () => {
    const deps = createDeps({ getConvo: jest.fn(async () => null) });
    const res = await run(deps, { conversationId: 'someone-elses', version: 4 });
    expect(deps.getConvo).toHaveBeenCalledWith(USER_ID, 'someone-elses');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(deps.getMessages).not.toHaveBeenCalled();
    expect(deps.setSkillPublicationState).not.toHaveBeenCalled();
  });

  it('rejects a conversation where the skill was not picked with 400', async () => {
    const deps = createDeps({
      getMessages: jest.fn(async () => testMessages({ manualSkills: ['other-skill'] })),
    });
    const res = await run(deps, { conversationId: 'convo-1', version: 4 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SKILL_NOT_USED' }));
    expect(deps.setSkillPublicationState).not.toHaveBeenCalled();
  });

  it.each([
    ['no response yet', null, 'RESPONSE_MISSING'],
    ['an error response', { error: true }, 'RESPONSE_FAILED'],
    ['an unfinished response', { unfinished: true }, 'RESPONSE_FAILED'],
    ['a response the user stopped', { finish_reason: 'incomplete' }, 'RESPONSE_FAILED'],
    [
      'a response cut at the tool call limit',
      { finish_reason: 'tool_call_limit' },
      'RESPONSE_FAILED',
    ],
    [
      'a response with an error content part',
      { content: [{ type: 'text' }, { type: 'error' }] },
      'RESPONSE_FAILED',
    ],
  ])('rejects %s with 400', async (_label, response, code) => {
    const deps = createDeps({ getMessages: jest.fn(async () => testMessages({ response })) });
    const res = await run(deps, { conversationId: 'convo-1', version: 4 });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code }));
    expect(deps.setSkillPublicationState).not.toHaveBeenCalled();
  });

  it('records the seconds between the user message and the finished response', async () => {
    const deps = createDeps();
    const res = await run(deps, { conversationId: 'convo-1', version: 4 });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(deps.getMessages).toHaveBeenCalledWith(
      { conversationId: 'convo-1', user: USER_ID },
      expect.any(String),
    );
    expect(deps.setSkillPublicationState).toHaveBeenCalledTimes(1);
    expect(deps.setSkillPublicationState).toHaveBeenCalledWith({
      id: SKILL_ID.toString(),
      expectedVersion: 4,
      lastTest: {
        version: 4,
        seconds: 42.5,
        conversationId: 'convo-1',
        at: expect.any(Date),
      },
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 4,
        lastTest: expect.objectContaining({ version: 4, seconds: 42.5 }),
      }),
    );
  });

  it('accepts a response that finished with stop', async () => {
    const deps = createDeps({
      getMessages: jest.fn(async () =>
        testMessages({ response: { finish_reason: 'stop', content: [{ type: 'text' }] } }),
      ),
    });
    const res = await run(deps, { conversationId: 'convo-1', version: 4 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('reads the finish reason and content part types of the turn', async () => {
    const deps = createDeps();
    await run(deps, { conversationId: 'convo-1', version: 4 });
    const select = (deps.getMessages.mock.calls[0][1] as string).split(' ');
    expect(select).toEqual(expect.arrayContaining(['finish_reason', 'content.type']));
  });

  it('uses the latest turn that picked the skill', async () => {
    const later = new Date('2026-09-27T02:00:00.000Z');
    const messages = [
      ...testMessages({ response: { error: true } }),
      {
        messageId: 'user-msg-2',
        parentMessageId: 'response-msg',
        isCreatedByUser: true,
        manualSkills: ['weekly-report'],
        createdAt: later,
        updatedAt: later,
      },
      {
        messageId: 'response-msg-2',
        parentMessageId: 'user-msg-2',
        isCreatedByUser: false,
        createdAt: later,
        updatedAt: new Date('2026-09-27T02:00:10.000Z'),
      },
    ];
    const deps = createDeps({ getMessages: jest.fn(async () => messages) });
    const res = await run(deps, { conversationId: 'convo-1', version: 4 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(deps.setSkillPublicationState.mock.calls[0][0].lastTest.seconds).toBe(10);
  });

  it('answers 409 when the skill changed while the result was being recorded', async () => {
    const deps = createDeps({
      setSkillPublicationState: jest.fn(async () => ({
        status: 'conflict' as const,
        current: createSkill({ version: 6 }),
      })),
    });
    const res = await run(deps, { conversationId: 'convo-1', version: 4 });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'skill_version_conflict',
      current: expect.objectContaining({ version: 6 }),
    });
  });
});

describe('createSkillPublishHandler', () => {
  const allow: SkillSharePolicy['checkShareAccess'] = async (_req, _res, next) => next();

  function createPolicy(overrides: Partial<Record<keyof SkillSharePolicy, jest.Mock>> = {}) {
    return {
      checkShareAccess: jest.fn(allow),
      checkSharePublicAccess: jest.fn(allow),
      ...overrides,
    };
  }

  const TESTED = { version: 4, seconds: 42.5, conversationId: 'convo-1', at: new Date() };
  const TEAM_GROUP = new Types.ObjectId();
  const OLD_TEAM_GROUP = new Types.ObjectId();

  function createDeps(overrides: Partial<SkillPublishDeps> = {}) {
    return {
      getSkillById: jest.fn(async () => null),
      setSkillPublicationState: jest.fn(async ({ expectedVersion, publishedAt }) => ({
        status: 'updated' as const,
        skill: createSkill({
          version: expectedVersion,
          lastTest: TESTED,
          publishedAt: publishedAt ?? undefined,
        }),
      })),
      findEntriesByResource: jest.fn(async () => []),
      bulkUpdateResourcePermissions: jest.fn(async () => ({})),
      sharePolicy: createPolicy(),
      getSkillAuthorDepartments: jest.fn(async () => ({ [USER_ID]: '정세분석팀' })),
      departmentGroups: {
        syncDepartment: jest.fn(async () => TEAM_GROUP.toString()),
        findGroupIds: jest.fn(
          async () => new Set([TEAM_GROUP.toString(), OLD_TEAM_GROUP.toString()]),
        ),
      },
      ...overrides,
    } as SkillPublishDeps & {
      setSkillPublicationState: jest.Mock;
      findEntriesByResource: jest.Mock;
      bulkUpdateResourcePermissions: jest.Mock;
      getSkillAuthorDepartments: jest.Mock;
      departmentGroups: { syncDepartment: jest.Mock; findGroupIds: jest.Mock };
      sharePolicy: { checkShareAccess: jest.Mock; checkSharePublicAccess: jest.Mock };
    };
  }

  const testedSkill = (overrides: Partial<SkillDoc> = {}) =>
    createSkill({ lastTest: TESTED, ...overrides });

  async function run(deps: SkillPublishDeps, body: unknown, skill: SkillDoc = testedSkill()) {
    const res = createResponse();
    await createSkillPublishHandler(deps)(createRequest(skill, body), res as unknown as Response);
    return res;
  }

  it.each([
    ['unknown scope', { scope: 'world' }],
    ['missing scope', {}],
  ])('rejects %s with 400 before touching anything', async (_label, body) => {
    const deps = createDeps();
    const res = await run(deps, body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(deps.sharePolicy.checkShareAccess).not.toHaveBeenCalled();
    expect(deps.setSkillPublicationState).not.toHaveBeenCalled();
    expect(deps.bulkUpdateResourcePermissions).not.toHaveBeenCalled();
  });

  it.each([
    ['never tested', { lastTest: undefined }, 'TEST_REQUIRED'],
    [
      'tested on an older version',
      { lastTest: { version: 3, seconds: 5, conversationId: 'c', at: new Date() } },
      'TEST_REQUIRED',
    ],
    ['no manual minutes', { manualMinutes: undefined }, 'MANUAL_MINUTES_REQUIRED'],
    ['zero manual minutes', { manualMinutes: 0 }, 'MANUAL_MINUTES_REQUIRED'],
    ['a blank body', { body: '  \n' }, 'BODY_REQUIRED'],
    ['a frontmatter-only body', { body: '---\nname: weekly-report\n---\n' }, 'BODY_REQUIRED'],
  ])('rejects a skill with %s', async (_label, overrides, code) => {
    const deps = createDeps();
    const res = await run(deps, { scope: 'all' }, testedSkill(overrides as Partial<SkillDoc>));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code }));
    expect(deps.setSkillPublicationState).not.toHaveBeenCalled();
    expect(deps.bulkUpdateResourcePermissions).not.toHaveBeenCalled();
  });

  it('stops when the share policy denies the caller', async () => {
    const deny: SkillSharePolicy['checkShareAccess'] = async (_req, res) => {
      res.status(403).json({ error: 'Forbidden' });
    };
    const deps = createDeps({ sharePolicy: createPolicy({ checkShareAccess: jest.fn(deny) }) });
    const res = await run(deps, { scope: 'me' });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(deps.setSkillPublicationState).not.toHaveBeenCalled();
    expect(deps.bulkUpdateResourcePermissions).not.toHaveBeenCalled();
  });

  it('checks public sharing rights only for the all scope', async () => {
    const deny: SkillSharePolicy['checkShareAccess'] = async (_req, res) => {
      res.status(403).json({ error: 'Forbidden' });
    };
    const policy = createPolicy({ checkSharePublicAccess: jest.fn(deny) });

    const denied = await run(createDeps({ sharePolicy: policy }), { scope: 'all' });
    expect(denied.status).toHaveBeenCalledWith(403);
    const publicReq = policy.checkSharePublicAccess.mock.calls[0][0] as ServerRequest & {
      params: { resourceType: string };
      body: { public: boolean };
    };
    expect(publicReq.params.resourceType).toBe(ResourceType.SKILL);
    expect(publicReq.body.public).toBe(true);

    policy.checkSharePublicAccess.mockClear();
    const allowed = await run(createDeps({ sharePolicy: policy }), { scope: 'me' });
    expect(allowed.status).toHaveBeenCalledWith(200);
    expect(policy.checkSharePublicAccess).not.toHaveBeenCalled();
  });

  it('publishes to everyone with a public viewer grant and a publish time', async () => {
    const deps = createDeps();
    const res = await run(deps, { scope: 'all' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(deps.setSkillPublicationState).toHaveBeenCalledWith({
      id: SKILL_ID.toString(),
      expectedVersion: 4,
      publishedAt: expect.any(Date),
    });
    expect(deps.bulkUpdateResourcePermissions).toHaveBeenCalledWith({
      resourceType: ResourceType.SKILL,
      resourceId: SKILL_ID,
      updatedPrincipals: [
        { type: PrincipalType.PUBLIC, id: null, accessRoleId: AccessRoleIds.SKILL_VIEWER },
      ],
      revokedPrincipals: [],
      grantedBy: USER_ID,
    });
    const body = res.json.mock.calls[0][0];
    expect(body.version).toBe(4);
    expect(typeof body.publishedAt).toBe('string');
    expect(body.lastTest.version).toBe(4);
  });

  it('publishes to the owner only by revoking every grant but the author', async () => {
    const colleague = new Types.ObjectId();
    const group = new Types.ObjectId();
    const deps = createDeps({
      findEntriesByResource: jest.fn(async () => [
        { principalType: PrincipalType.USER, principalId: new Types.ObjectId(USER_ID) },
        { principalType: PrincipalType.USER, principalId: colleague },
        { principalType: PrincipalType.GROUP, principalId: group },
        { principalType: PrincipalType.ROLE, principalId: 'ADMIN' },
        { principalType: PrincipalType.PUBLIC, principalId: null },
      ]),
    });
    const res = await run(deps, { scope: 'me' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(deps.findEntriesByResource).toHaveBeenCalledWith(ResourceType.SKILL, SKILL_ID);
    expect(deps.bulkUpdateResourcePermissions).toHaveBeenCalledWith({
      resourceType: ResourceType.SKILL,
      resourceId: SKILL_ID,
      updatedPrincipals: [],
      revokedPrincipals: [
        { type: PrincipalType.PUBLIC, id: null },
        { type: PrincipalType.USER, id: colleague.toString() },
        { type: PrincipalType.GROUP, id: group.toString() },
        { type: PrincipalType.ROLE, id: 'ADMIN' },
      ],
      grantedBy: USER_ID,
    });
  });

  it('revokes the public grant for the me scope even when no entry is listed', async () => {
    const deps = createDeps();
    await run(deps, { scope: 'me' });
    expect(deps.bulkUpdateResourcePermissions.mock.calls[0][0].revokedPrincipals).toEqual([
      { type: PrincipalType.PUBLIC, id: null },
    ]);
  });

  it('publishes to the author department group and revokes public and old department grants', async () => {
    const colleague = new Types.ObjectId();
    const manualGroup = new Types.ObjectId();
    const deps = createDeps({
      findEntriesByResource: jest.fn(async () => [
        { principalType: PrincipalType.USER, principalId: new Types.ObjectId(USER_ID) },
        { principalType: PrincipalType.USER, principalId: colleague },
        { principalType: PrincipalType.GROUP, principalId: manualGroup },
        { principalType: PrincipalType.GROUP, principalId: OLD_TEAM_GROUP },
        { principalType: PrincipalType.PUBLIC, principalId: null },
      ]),
    });
    const res = await run(deps, { scope: 'team' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(deps.getSkillAuthorDepartments).toHaveBeenCalledWith([USER_ID]);
    expect(deps.departmentGroups.syncDepartment).toHaveBeenCalledWith('정세분석팀');
    expect(deps.bulkUpdateResourcePermissions).toHaveBeenCalledWith({
      resourceType: ResourceType.SKILL,
      resourceId: SKILL_ID,
      updatedPrincipals: [
        {
          type: PrincipalType.GROUP,
          id: TEAM_GROUP.toString(),
          accessRoleId: AccessRoleIds.SKILL_VIEWER,
        },
      ],
      revokedPrincipals: [
        { type: PrincipalType.PUBLIC, id: null },
        { type: PrincipalType.GROUP, id: OLD_TEAM_GROUP.toString() },
      ],
      grantedBy: USER_ID,
    });
    const body = res.json.mock.calls[0][0];
    expect(body.scope).toBe('team');
    expect(body.isPublic).toBe(false);
  });

  it('does not ask for public sharing rights for the team scope', async () => {
    const deps = createDeps();
    await run(deps, { scope: 'team' });
    expect(deps.sharePolicy.checkShareAccess).toHaveBeenCalledTimes(1);
    expect(deps.sharePolicy.checkSharePublicAccess).not.toHaveBeenCalled();
  });

  it('does not touch the department group when the share policy denies the caller', async () => {
    const deny: SkillSharePolicy['checkShareAccess'] = async (_req, res) => {
      res.status(403).json({ error: 'Forbidden' });
    };
    const deps = createDeps({ sharePolicy: createPolicy({ checkShareAccess: jest.fn(deny) }) });
    const res = await run(deps, { scope: 'team' });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(deps.departmentGroups.syncDepartment).not.toHaveBeenCalled();
    expect(deps.bulkUpdateResourcePermissions).not.toHaveBeenCalled();
  });

  it('rejects the team scope when the author has no department', async () => {
    const deps = createDeps({ getSkillAuthorDepartments: jest.fn(async () => ({})) });
    const res = await run(deps, { scope: 'team' });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'DEPARTMENT_REQUIRED' }));
    expect(deps.departmentGroups.syncDepartment).not.toHaveBeenCalled();
    expect(deps.setSkillPublicationState).not.toHaveBeenCalled();
    expect(deps.bulkUpdateResourcePermissions).not.toHaveBeenCalled();
  });

  it('revokes department grants when publishing to everyone', async () => {
    const manualGroup = new Types.ObjectId();
    const deps = createDeps({
      findEntriesByResource: jest.fn(async () => [
        { principalType: PrincipalType.USER, principalId: new Types.ObjectId(USER_ID) },
        { principalType: PrincipalType.GROUP, principalId: manualGroup },
        { principalType: PrincipalType.GROUP, principalId: TEAM_GROUP },
      ]),
    });
    const res = await run(deps, { scope: 'all' });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(deps.bulkUpdateResourcePermissions.mock.calls[0][0]).toMatchObject({
      updatedPrincipals: [
        { type: PrincipalType.PUBLIC, id: null, accessRoleId: AccessRoleIds.SKILL_VIEWER },
      ],
      revokedPrincipals: [{ type: PrincipalType.GROUP, id: TEAM_GROUP.toString() }],
    });
    expect(res.json.mock.calls[0][0].scope).toBe('all');
  });

  it('reports the me scope in the response', async () => {
    const res = await run(createDeps(), { scope: 'me' });
    expect(res.json.mock.calls[0][0].scope).toBe('me');
  });

  it('answers 409 without touching the ACL when the skill changed first', async () => {
    const deps = createDeps({
      setSkillPublicationState: jest.fn(async () => ({
        status: 'conflict' as const,
        current: createSkill({ version: 7 }),
      })),
    });
    const res = await run(deps, { scope: 'all' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(deps.bulkUpdateResourcePermissions).not.toHaveBeenCalled();
  });

  it('restores the previous publish state when the ACL update fails', async () => {
    const previous = new Date('2026-09-01T00:00:00.000Z');
    const deps = createDeps({
      bulkUpdateResourcePermissions: jest.fn(async () => {
        throw new Error('acl down');
      }),
    });
    const res = await run(deps, { scope: 'all' }, testedSkill({ publishedAt: previous }));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(deps.setSkillPublicationState).toHaveBeenCalledTimes(2);
    expect(deps.setSkillPublicationState.mock.calls[1][0]).toEqual({
      id: SKILL_ID.toString(),
      expectedVersion: 4,
      publishedAt: previous,
    });
  });

  it('rolls back and answers PUBLISH_ACL_FAILED when the ACL update reports errors', async () => {
    const previous = new Date('2026-09-01T00:00:00.000Z');
    const deps = createDeps({
      bulkUpdateResourcePermissions: jest.fn(async () => ({
        granted: [],
        updated: [],
        revoked: [],
        errors: [
          { principal: { type: PrincipalType.PUBLIC }, error: 'Role skill_viewer not found' },
        ],
      })),
    });
    const res = await run(deps, { scope: 'all' }, testedSkill({ publishedAt: previous }));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PUBLISH_ACL_FAILED' }));
    expect(deps.setSkillPublicationState).toHaveBeenCalledTimes(2);
    expect(deps.setSkillPublicationState.mock.calls[1][0].publishedAt).toEqual(previous);
  });

  it('clears the publish time on rollback when the skill was a draft', async () => {
    const deps = createDeps({
      bulkUpdateResourcePermissions: jest.fn(async () => {
        throw new Error('acl down');
      }),
    });
    await run(deps, { scope: 'me' }, testedSkill({ publishedAt: undefined }));
    expect(deps.setSkillPublicationState.mock.calls[1][0].publishedAt).toBeNull();
  });
});

describe('share policy request', () => {
  it('passes the caller through to the share middleware', async () => {
    const seen: Array<{ userId?: string }> = [];
    const record = async (req: ServerRequest, _res: Response, next: NextFunction) => {
      seen.push({ userId: req.user?.id });
      next();
    };
    const deps = {
      getSkillById: jest.fn(async () => null),
      setSkillPublicationState: jest.fn(async ({ expectedVersion, publishedAt }) => ({
        status: 'updated' as const,
        skill: createSkill({ version: expectedVersion, publishedAt }),
      })),
      findEntriesByResource: jest.fn(async () => []),
      bulkUpdateResourcePermissions: jest.fn(async () => ({})),
      sharePolicy: { checkShareAccess: record, checkSharePublicAccess: record },
    } as unknown as SkillPublishDeps;
    const res = createResponse();
    await createSkillPublishHandler(deps)(
      createRequest(
        createSkill({
          lastTest: { version: 4, seconds: 1, conversationId: 'c', at: new Date() },
        }),
        { scope: 'all' },
      ),
      res as unknown as Response,
    );
    expect(seen).toEqual([{ userId: USER_ID }, { userId: USER_ID }]);
  });
});
