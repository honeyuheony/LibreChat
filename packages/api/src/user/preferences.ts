import { logger } from '@librechat/data-schemas';
import {
  USER_APPROVAL_MODES,
  STATEFUL_CODE_ENVIRONMENTS,
  DEFAULT_USER_APPROVAL_MODE,
  MAX_USER_INSTRUCTIONS_LENGTH,
  resolveAllowedStatefulCodeEnvironments,
} from 'librechat-data-provider';
import type {
  UserApprovalMode,
  TWorkspacePreferences,
  StatefulCodeEnvironment,
  TUpdateWorkspacePreferencesRequest,
} from 'librechat-data-provider';
import type { IUser } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types';

interface UserPreferencesBody {
  statefulCodeEnvironment?: string;
}

function isStatefulCodeEnvironment(value: string): value is StatefulCodeEnvironment {
  return STATEFUL_CODE_ENVIRONMENTS.some((environment) => environment === value);
}

type UserPreferencesRequest = Omit<ServerRequest, 'body' | 'user'> & {
  body: UserPreferencesBody;
  user?: IUser;
};

export interface UserPreferencesHandlerDeps {
  updateStatefulCodeEnvironment: (
    userId: string,
    environment: StatefulCodeEnvironment,
  ) => Promise<IUser | null>;
}

export function createUserPreferencesHandler(
  deps: UserPreferencesHandlerDeps,
): (req: UserPreferencesRequest, res: Response) => Promise<Response> {
  return async (req: UserPreferencesRequest, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const environment = req.body?.statefulCodeEnvironment;
    if (typeof environment !== 'string' || !isStatefulCodeEnvironment(environment)) {
      return res.status(400).json({
        message: `statefulCodeEnvironment must be one of: ${STATEFUL_CODE_ENVIRONMENTS.join(', ')}`,
      });
    }

    const allowedEnvironments = resolveAllowedStatefulCodeEnvironments(
      req.config?.endpoints?.agents?.statefulCodeSessions?.allowedEnvironments,
    );
    if (!allowedEnvironments.includes(environment)) {
      return res.status(403).json({
        message: `statefulCodeEnvironment is not allowed by this deployment: ${environment}`,
      });
    }

    try {
      const updatedUser = await deps.updateStatefulCodeEnvironment(userId, environment);
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.status(200).json({
        updated: true,
        preferences: {
          statefulCodeEnvironment:
            updatedUser.personalization?.statefulCodeEnvironment ?? environment,
        },
      });
    } catch (error) {
      logger.error('[UserPreferences] Error updating preferences:', error);
      return res.status(500).json({ message: 'Failed to update user preferences' });
    }
  };
}

/** 배포 환경에 등록된 커넥터를 모두 담기에 충분하다. 이보다 큰 본문은 실제 스위치 조작이 아니다. */
const MAX_CONNECTOR_DEFAULTS_PER_REQUEST = 100;

/**
 * 서버 이름이 Mongo 경로 조각(`personalization.connectorDefaults.<name>`)이 되므로, 경로를 나누는
 * `.` 이 들어가거나 연산자로 읽히는 `$` 로 시작하면 안 된다.
 */
function isConnectorName(name: string): boolean {
  return name.length > 0 && name.length <= 200 && !name.includes('.') && !name.startsWith('$');
}

type ConnectorDefaultsRequest = Omit<ServerRequest, 'body' | 'user'> & {
  body: { connectorDefaults?: unknown };
  user?: IUser;
};

export interface ConnectorDefaultsHandlerDeps {
  updateConnectorDefaults: (
    userId: string,
    defaults: Record<string, boolean>,
  ) => Promise<IUser | null>;
}

/**
 * 새 채팅을 시작할 때 켜 둘 커넥터를 사용자마다 저장한다. 본문에는 바꾸는 커넥터만 적고, 나머지는
 * 저장된 값이나 설정 기본값을 그대로 쓴다.
 */
export function createConnectorDefaultsHandler(
  deps: ConnectorDefaultsHandlerDeps,
): (req: ConnectorDefaultsRequest, res: Response) => Promise<Response> {
  return async (req: ConnectorDefaultsRequest, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const input = req.body?.connectorDefaults;
    const entries =
      input != null && typeof input === 'object' && !Array.isArray(input)
        ? Object.entries(input)
        : [];
    const valid =
      entries.length > 0 &&
      entries.length <= MAX_CONNECTOR_DEFAULTS_PER_REQUEST &&
      entries.every(([name, on]) => isConnectorName(name) && typeof on === 'boolean');
    if (!valid) {
      return res.status(400).json({
        message: 'connectorDefaults must map connector names to true or false',
      });
    }

    try {
      const updatedUser = await deps.updateConnectorDefaults(
        userId,
        Object.fromEntries(entries) as Record<string, boolean>,
      );
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      return res.status(200).json({
        updated: true,
        preferences: {
          connectorDefaults: updatedUser.personalization?.connectorDefaults ?? {},
        },
      });
    } catch (error) {
      logger.error('[UserPreferences] Error updating connector defaults:', error);
      return res.status(500).json({ message: 'Failed to update connector defaults' });
    }
  };
}

type WorkspacePreferencesRequest = Omit<ServerRequest, 'body' | 'user'> & {
  body: { instructions?: unknown; approvalMode?: unknown };
  user?: IUser;
};

export interface WorkspacePreferencesHandlerDeps {
  updateWorkspacePreferences: (
    userId: string,
    preferences: TUpdateWorkspacePreferencesRequest,
  ) => Promise<IUser | null>;
}

type PersonalizationHolder = Pick<IUser, 'personalization'> | null | undefined;

function isUserApprovalMode(value: unknown): value is UserApprovalMode {
  return USER_APPROVAL_MODES.some((mode) => mode === value);
}

/** 값이 잘못된 필드가 있거나 필드가 하나도 없으면 `null` 을 돌려준다. */
function parseWorkspacePreferences(body: {
  instructions?: unknown;
  approvalMode?: unknown;
}): TUpdateWorkspacePreferencesRequest | null {
  const { instructions, approvalMode } = body ?? {};
  if (instructions === undefined && approvalMode === undefined) {
    return null;
  }
  if (
    instructions !== undefined &&
    (typeof instructions !== 'string' || instructions.length > MAX_USER_INSTRUCTIONS_LENGTH)
  ) {
    return null;
  }
  if (approvalMode !== undefined && !isUserApprovalMode(approvalMode)) {
    return null;
  }
  return {
    ...(instructions !== undefined && { instructions }),
    ...(approvalMode !== undefined && { approvalMode }),
  };
}

/** 저장한 적 없는 값은 기본값으로 채운다. */
export function resolveWorkspacePreferences(user: PersonalizationHolder): TWorkspacePreferences {
  return {
    instructions: user?.personalization?.instructions ?? '',
    approvalMode: user?.personalization?.approvalMode ?? DEFAULT_USER_APPROVAL_MODE,
  };
}

/** 사용자 전역 지침을 공유 맥락 블록으로 만든다. 지침이 없으면 `undefined` 다. */
export function formatUserInstructionsContext(user: PersonalizationHolder): string | undefined {
  const instructions = user?.personalization?.instructions?.trim();
  return instructions ? `# 사용자 전역 지침\n${instructions}` : undefined;
}

/** 로그인한 사용자 본인의 작업 공간 설정만 돌려준다. 다른 사용자를 지정할 방법은 없다. */
export function getWorkspacePreferencesHandler(
  req: Pick<WorkspacePreferencesRequest, 'user'>,
  res: Response,
): Response {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  return res.status(200).json(resolveWorkspacePreferences(req.user));
}

/** 전역 지침과 승인 방식을 저장한다. 본문에서 뺀 필드는 저장된 값을 그대로 둔다. */
export function createWorkspacePreferencesHandler(
  deps: WorkspacePreferencesHandlerDeps,
): (req: WorkspacePreferencesRequest, res: Response) => Promise<Response> {
  return async (req: WorkspacePreferencesRequest, res: Response): Promise<Response> => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const preferences = parseWorkspacePreferences(req.body);
    if (!preferences) {
      return res.status(400).json({
        message: `Send instructions (at most ${MAX_USER_INSTRUCTIONS_LENGTH} characters) and/or approvalMode (one of: ${USER_APPROVAL_MODES.join(', ')})`,
      });
    }

    try {
      const updatedUser = await deps.updateWorkspacePreferences(userId, preferences);
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      return res.status(200).json({
        updated: true,
        preferences: resolveWorkspacePreferences(updatedUser),
      });
    } catch (error) {
      logger.error('[UserPreferences] Error updating workspace preferences:', error);
      return res.status(500).json({ message: 'Failed to update workspace preferences' });
    }
  };
}
