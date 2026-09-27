import type { ISkill, UpdateSkillResult } from '@librechat/data-schemas';
import type { TSkillConflictResponse } from 'librechat-data-provider';
import type { Types } from 'mongoose';
import type { ServerRequest } from '~/types';
import { serializeSkill } from '../handlers';

export type SkillDoc = ISkill & { _id: Types.ObjectId };

/** data-schemas `setSkillPublicationState` 인자와 같은 모양. 그 타입은 패키지 밖으로 내보내지 않는다. */
export type PublicationStateUpdate = {
  id: string;
  expectedVersion: number;
  lastTest?: ISkill['lastTest'];
  publishedAt?: Date | null;
};

export interface SkillLookupDeps {
  getSkillById: (id: string | Types.ObjectId) => Promise<SkillDoc | null>;
  /** 게시 상태 칸만 적고 `version` 은 올리지 않는다. 내용 수정만 버전을 올려 시험 통과를 푼다. */
  setSkillPublicationState: (params: PublicationStateUpdate) => Promise<UpdateSkillResult>;
}

export type SkillRequest = ServerRequest & { resourceAccess?: { resourceInfo?: SkillDoc } };

export async function loadSkill(
  req: SkillRequest,
  deps: SkillLookupDeps,
): Promise<SkillDoc | null> {
  return (
    req.resourceAccess?.resourceInfo ?? (await deps.getSkillById((req.params as { id: string }).id))
  );
}

export function conflictResponse(current: SkillDoc, isPublic: boolean): TSkillConflictResponse {
  return { error: 'skill_version_conflict', current: serializeSkill(current, isPublic) };
}
