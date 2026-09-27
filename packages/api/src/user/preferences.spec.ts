import { MAX_USER_INSTRUCTIONS_LENGTH } from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import {
  resolveWorkspacePreferences,
  createUserPreferencesHandler,
  formatUserInstructionsContext,
  createConnectorDefaultsHandler,
  getWorkspacePreferencesHandler,
  createWorkspacePreferencesHandler,
} from './preferences';

interface MockResponse extends Partial<Response> {
  statusCode: number;
  body?: object;
  status: jest.Mock;
  json: jest.Mock;
}

function createResponse(): MockResponse {
  const response: MockResponse = {
    statusCode: 200,
    status: jest.fn((statusCode: number) => {
      response.statusCode = statusCode;
      return response;
    }),
    json: jest.fn((body: object) => {
      response.body = body;
      return response;
    }),
  };
  return response;
}

function createRequest(body: object, authenticated = true): Request & { user?: Partial<IUser> } {
  return {
    body,
    user: authenticated ? { id: 'user-1' } : undefined,
  } as Request & { user?: Partial<IUser> };
}

describe('createUserPreferencesHandler', () => {
  it.each(['user', 'agent-user', 'conversation'] as const)(
    'persists the %s stateful workspace default',
    async (statefulCodeEnvironment) => {
      const updateStatefulCodeEnvironment = jest.fn().mockResolvedValue({
        personalization: { statefulCodeEnvironment },
      });
      const handler = createUserPreferencesHandler({ updateStatefulCodeEnvironment });
      const response = createResponse();

      await handler(
        createRequest({ statefulCodeEnvironment }) as Parameters<typeof handler>[0],
        response as Response,
      );

      expect(updateStatefulCodeEnvironment).toHaveBeenCalledWith('user-1', statefulCodeEnvironment);
      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({
        updated: true,
        preferences: { statefulCodeEnvironment },
      });
    },
  );

  it('rejects an invalid stateful workspace default', async () => {
    const updateStatefulCodeEnvironment = jest.fn();
    const handler = createUserPreferencesHandler({ updateStatefulCodeEnvironment });
    const response = createResponse();

    await handler(
      createRequest({ statefulCodeEnvironment: 'agent' }) as Parameters<typeof handler>[0],
      response as Response,
    );

    expect(updateStatefulCodeEnvironment).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(400);
  });

  it('rejects a valid scope excluded by deployment policy', async () => {
    const updateStatefulCodeEnvironment = jest.fn();
    const handler = createUserPreferencesHandler({ updateStatefulCodeEnvironment });
    const response = createResponse();
    const request = createRequest({ statefulCodeEnvironment: 'conversation' }) as Parameters<
      typeof handler
    >[0];
    request.config = {
      endpoints: {
        agents: {
          statefulCodeSessions: { allowedEnvironments: ['user', 'agent-user'] },
        },
      },
    } as NonNullable<typeof request.config>;

    await handler(request, response as Response);

    expect(updateStatefulCodeEnvironment).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(403);
  });

  it('requires an authenticated user', async () => {
    const updateStatefulCodeEnvironment = jest.fn();
    const handler = createUserPreferencesHandler({ updateStatefulCodeEnvironment });
    const response = createResponse();

    await handler(
      createRequest({ statefulCodeEnvironment: 'user' }, false) as Parameters<typeof handler>[0],
      response as Response,
    );

    expect(updateStatefulCodeEnvironment).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(401);
  });

  it('returns not found when the user no longer exists', async () => {
    const updateStatefulCodeEnvironment = jest.fn().mockResolvedValue(null);
    const handler = createUserPreferencesHandler({ updateStatefulCodeEnvironment });
    const response = createResponse();

    await handler(
      createRequest({ statefulCodeEnvironment: 'user' }) as Parameters<typeof handler>[0],
      response as Response,
    );

    expect(response.statusCode).toBe(404);
  });
});

describe('createConnectorDefaultsHandler', () => {
  it('saves the switched connectors and returns every stored switch', async () => {
    const updateConnectorDefaults = jest.fn().mockResolvedValue({
      personalization: { connectorDefaults: { law: true, slack: false } },
    });
    const handler = createConnectorDefaultsHandler({ updateConnectorDefaults });
    const response = createResponse();

    await handler(
      createRequest({ connectorDefaults: { slack: false } }) as Parameters<typeof handler>[0],
      response as Response,
    );

    expect(updateConnectorDefaults).toHaveBeenCalledWith('user-1', { slack: false });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      updated: true,
      preferences: { connectorDefaults: { law: true, slack: false } },
    });
  });

  it.each([
    ['no switches', {}],
    ['a list', ['law']],
    ['a non-boolean value', { law: 'yes' }],
    ['a name that splits the stored path', { 'a.b': true }],
    ['a name that reads as an operator', { $set: true }],
    ['an empty name', { '': true }],
  ])('rejects %s', async (_label, connectorDefaults) => {
    const updateConnectorDefaults = jest.fn();
    const handler = createConnectorDefaultsHandler({ updateConnectorDefaults });
    const response = createResponse();

    await handler(
      createRequest({ connectorDefaults }) as Parameters<typeof handler>[0],
      response as Response,
    );

    expect(response.statusCode).toBe(400);
    expect(updateConnectorDefaults).not.toHaveBeenCalled();
  });

  it('requires a signed-in user', async () => {
    const updateConnectorDefaults = jest.fn();
    const handler = createConnectorDefaultsHandler({ updateConnectorDefaults });
    const response = createResponse();

    await handler(
      createRequest({ connectorDefaults: { law: true } }, false) as Parameters<typeof handler>[0],
      response as Response,
    );

    expect(response.statusCode).toBe(401);
    expect(updateConnectorDefaults).not.toHaveBeenCalled();
  });

  it('answers 404 when the user is gone', async () => {
    const handler = createConnectorDefaultsHandler({
      updateConnectorDefaults: jest.fn().mockResolvedValue(null),
    });
    const response = createResponse();

    await handler(
      createRequest({ connectorDefaults: { law: true } }) as Parameters<typeof handler>[0],
      response as Response,
    );

    expect(response.statusCode).toBe(404);
  });
});

describe('createWorkspacePreferencesHandler', () => {
  function run(body: object, updated: Partial<IUser> | null = null, authenticated = true) {
    const updateWorkspacePreferences = jest.fn().mockResolvedValue(updated);
    const handler = createWorkspacePreferencesHandler({ updateWorkspacePreferences });
    const response = createResponse();
    const done = handler(
      createRequest(body, authenticated) as Parameters<typeof handler>[0],
      response as Response,
    );
    return { done, response, updateWorkspacePreferences };
  }

  it('saves workspace instructions and approval mode and answers with both values', async () => {
    const { done, response, updateWorkspacePreferences } = run(
      { instructions: 'Answer in Korean.', approvalMode: 'auto' },
      { personalization: { instructions: 'Answer in Korean.', approvalMode: 'auto' } },
    );
    await done;

    expect(updateWorkspacePreferences).toHaveBeenCalledWith('user-1', {
      instructions: 'Answer in Korean.',
      approvalMode: 'auto',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      updated: true,
      preferences: { instructions: 'Answer in Korean.', approvalMode: 'auto' },
    });
  });

  it('saves one workspace field without sending the other', async () => {
    const { done, updateWorkspacePreferences } = run(
      { approvalMode: 'manual', memories: false },
      { personalization: { approvalMode: 'manual' } },
    );
    await done;

    expect(updateWorkspacePreferences).toHaveBeenCalledWith('user-1', { approvalMode: 'manual' });
  });

  it('accepts workspace instructions exactly at the length limit', async () => {
    const instructions = 'a'.repeat(MAX_USER_INSTRUCTIONS_LENGTH);
    const { done, response } = run({ instructions }, { personalization: { instructions } });
    await done;

    expect(response.statusCode).toBe(200);
  });

  it.each([
    [
      'instructions over the length limit',
      { instructions: 'a'.repeat(MAX_USER_INSTRUCTIONS_LENGTH + 1) },
    ],
    ['non-string instructions', { instructions: 42 }],
    ['an approval mode outside the allowed values', { approvalMode: 'always' }],
    ['a non-string approval mode', { approvalMode: true }],
    ['a body with neither workspace field', { memories: false }],
  ])('rejects workspace preferences with %s', async (_label, body) => {
    const { done, response, updateWorkspacePreferences } = run(body);
    await done;

    expect(response.statusCode).toBe(400);
    expect(updateWorkspacePreferences).not.toHaveBeenCalled();
  });

  it('requires an authenticated user for workspace preferences', async () => {
    const { done, response, updateWorkspacePreferences } = run(
      { approvalMode: 'auto' },
      null,
      false,
    );
    await done;

    expect(response.statusCode).toBe(401);
    expect(updateWorkspacePreferences).not.toHaveBeenCalled();
  });

  it('answers 404 when the workspace preferences owner no longer exists', async () => {
    const { done, response } = run({ approvalMode: 'auto' }, null);
    await done;

    expect(response.statusCode).toBe(404);
  });
});

describe('getWorkspacePreferencesHandler', () => {
  it('reads the workspace preferences of the signed-in user with defaults filled in', () => {
    const response = createResponse();
    getWorkspacePreferencesHandler(
      { user: { id: 'user-1', personalization: { instructions: 'Cite sources.' } } } as Parameters<
        typeof getWorkspacePreferencesHandler
      >[0],
      response as Response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ instructions: 'Cite sources.', approvalMode: 'manual' });
  });

  it('requires an authenticated user to read workspace preferences', () => {
    const response = createResponse();
    getWorkspacePreferencesHandler(
      {} as Parameters<typeof getWorkspacePreferencesHandler>[0],
      response as Response,
    );

    expect(response.statusCode).toBe(401);
  });
});

describe('resolveWorkspacePreferences', () => {
  it('fills workspace defaults for a user without stored values', () => {
    expect(resolveWorkspacePreferences(undefined)).toEqual({
      instructions: '',
      approvalMode: 'manual',
    });
  });
});

describe('formatUserInstructionsContext', () => {
  it('puts the user instructions under their own heading', () => {
    expect(
      formatUserInstructionsContext({ personalization: { instructions: '  Answer in Korean.\n' } }),
    ).toBe('# 사용자 전역 지침\nAnswer in Korean.');
  });

  it.each([
    ['no user', undefined],
    ['no personalization', {}],
    ['empty user instructions', { personalization: { instructions: '' } }],
    ['blank user instructions', { personalization: { instructions: ' \n ' } }],
  ])('adds nothing for %s', (_label, user) => {
    expect(formatUserInstructionsContext(user)).toBeUndefined();
  });
});
