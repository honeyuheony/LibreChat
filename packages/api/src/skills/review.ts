import type { Types } from 'mongoose';

/**
 * 스킬의 관리자 검토 상태를 바꾸는 함수를 모았다. 이 함수를 부를
 * `POST /api/skills/:skillId/review` 라우트와 관리자 전용 검사는 아직 없다.
 */

/** 검토 칸만 바꾸는 DB 갱신 함수로, 일반 스킬 수정 경로와 따로 둔다. */
export interface ReviewSkillDeps {
  updateSkillReview: (params: {
    skillId: string | Types.ObjectId;
    reviewedAt: Date | null;
    reviewedBy: Types.ObjectId | string | null;
  }) => Promise<unknown>;
}

export interface MarkSkillReviewedParams {
  skillId: string | Types.ObjectId;
  reviewerId: Types.ObjectId | string;
}

export interface ClearSkillReviewParams {
  skillId: string | Types.ObjectId;
}

export async function markSkillReviewed(
  { skillId, reviewerId }: MarkSkillReviewedParams,
  { updateSkillReview }: ReviewSkillDeps,
): Promise<void> {
  await updateSkillReview({ skillId, reviewedAt: new Date(), reviewedBy: reviewerId });
}

export async function clearSkillReview(
  { skillId }: ClearSkillReviewParams,
  { updateSkillReview }: ReviewSkillDeps,
): Promise<void> {
  await updateSkillReview({ skillId, reviewedAt: null, reviewedBy: null });
}
