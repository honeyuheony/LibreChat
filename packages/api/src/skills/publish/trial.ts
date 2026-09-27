import { logger } from '@librechat/data-schemas';
import { ResourceType, ContentTypes, PermissionBits } from 'librechat-data-provider';
import type { Response } from 'express';
import type { Types } from 'mongoose';
import type { SkillLookupDeps, SkillRequest } from './lookup';
import { conflictResponse, loadSkill } from './lookup';
import { serializeSkill } from '../handlers';

/** 시험 대화에서 읽는 메시지 칸. 응답 행은 턴이 끝날 때 다시 저장되므로 `updatedAt` 이 끝난 시각이다. */
export interface SkillTestMessage {
  messageId: string;
  parentMessageId?: string | null;
  isCreatedByUser?: boolean;
  manualSkills?: string[] | null;
  error?: boolean | null;
  finish_reason?: string | null;
  content?: Array<{ type?: string | null } | null> | null;
  unfinished?: boolean | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface SkillTestResultDeps extends SkillLookupDeps {
  getConvo: (user: string, conversationId: string) => Promise<object | null>;
  getMessages: (
    filter: { conversationId: string; user: string },
    select?: string,
  ) => Promise<SkillTestMessage[]>;
  hasPublicPermission: (params: {
    resourceType: string;
    resourceId: string | Types.ObjectId;
    requiredPermissions: number;
  }) => Promise<boolean>;
}

const CLEAN_FINISH_REASONS = new Set<string>(['stop']);

function toTime(value: Date | string | null | undefined): number {
  return value == null ? Number.NaN : new Date(value).getTime();
}

/** 정상 agent 턴은 finish_reason 을 적지 않는다. 멈춘 응답('incomplete')·도구 한도('tool_call_limit')·오류 조각은 실패다. */
function finishedCleanly(response: SkillTestMessage): boolean {
  if (response.error || response.unfinished) {
    return false;
  }
  if (response.finish_reason != null && !CLEAN_FINISH_REASONS.has(response.finish_reason)) {
    return false;
  }
  return !response.content?.some((part) => part?.type === ContentTypes.ERROR);
}

/** 이 스킬을 고른 마지막 사용자 턴과 그 턴의 마지막 응답. */
function findTestTurn(
  messages: SkillTestMessage[],
  skillName: string,
): { userMessage: SkillTestMessage | null; response: SkillTestMessage | null } {
  let userMessage: SkillTestMessage | null = null;
  for (const message of messages) {
    const picked = message.isCreatedByUser === true && message.manualSkills?.includes(skillName);
    if (picked && (!userMessage || toTime(message.createdAt) >= toTime(userMessage.createdAt))) {
      userMessage = message;
    }
  }
  if (!userMessage) {
    return { userMessage: null, response: null };
  }
  let response: SkillTestMessage | null = null;
  for (const message of messages) {
    const answers =
      message.isCreatedByUser !== true && message.parentMessageId === userMessage.messageId;
    if (answers && (!response || toTime(message.updatedAt) >= toTime(response.updatedAt))) {
      response = message;
    }
  }
  return { userMessage, response };
}

/** `POST /api/skills/:id/test-result`: 시험 대화 한 턴이 오류 없이 끝났음을 확인하고 걸린 초를 `lastTest` 에 적는다. */
export function createSkillTestResultHandler(deps: SkillTestResultDeps) {
  return async function skillTestResultHandler(
    req: SkillRequest,
    res: Response,
  ): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { conversationId, version } = (req.body ?? {}) as {
      conversationId?: unknown;
      version?: unknown;
    };
    if (typeof conversationId !== 'string' || !conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }
    if (typeof version !== 'number' || !Number.isInteger(version)) {
      return res.status(400).json({ error: 'version must be an integer' });
    }
    try {
      const skill = await loadSkill(req, deps);
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }
      const isPublic = () =>
        deps.hasPublicPermission({
          resourceType: ResourceType.SKILL,
          resourceId: skill._id,
          requiredPermissions: PermissionBits.VIEW,
        });
      if (skill.version !== version) {
        return res.status(409).json(conflictResponse(skill, await isPublic()));
      }
      const convo = await deps.getConvo(userId, conversationId);
      if (!convo) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const messages = await deps.getMessages(
        { conversationId, user: userId },
        'messageId parentMessageId isCreatedByUser manualSkills error unfinished finish_reason content.type createdAt updatedAt',
      );
      const { userMessage, response } = findTestTurn(messages, skill.name);
      if (!userMessage) {
        return res
          .status(400)
          .json({ error: 'The conversation did not run this skill', code: 'SKILL_NOT_USED' });
      }
      if (!response) {
        return res
          .status(400)
          .json({ error: 'The test turn has no response yet', code: 'RESPONSE_MISSING' });
      }
      if (!finishedCleanly(response)) {
        return res
          .status(400)
          .json({ error: 'The test turn did not finish cleanly', code: 'RESPONSE_FAILED' });
      }
      const elapsedMs = toTime(response.updatedAt) - toTime(userMessage.createdAt);
      if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
        return res
          .status(400)
          .json({ error: 'The test turn has no usable timestamps', code: 'RESPONSE_MISSING' });
      }

      const result = await deps.setSkillPublicationState({
        id: skill._id.toString(),
        expectedVersion: version,
        lastTest: {
          version,
          seconds: Math.round(elapsedMs / 100) / 10,
          conversationId,
          at: new Date(),
        },
      });
      if (result.status === 'not_found') {
        return res.status(404).json({ error: 'Skill not found' });
      }
      if (result.status === 'conflict') {
        return res.status(409).json(conflictResponse(result.current, await isPublic()));
      }
      return res.status(200).json(serializeSkill(result.skill, await isPublic()));
    } catch (error) {
      logger.error('[skillTestResult] Failed to record test result', error);
      return res.status(500).json({ error: 'Failed to record test result' });
    }
  };
}
