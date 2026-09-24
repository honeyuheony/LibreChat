import type { Types } from 'mongoose';

/**
 * Admin review state helpers for skills. Not wired to a route yet — the
 * `POST /api/skills/:skillId/review` endpoint and its admin-only guard are
 * a follow-up task; this module only holds the update logic the route will
 * call.
 */

/** Injected DB update for the review fields, kept separate from the general skill CRUD update. */
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

/** Sets `reviewedAt` to now and `reviewedBy` to the approving admin. */
export async function markSkillReviewed(
  { skillId, reviewerId }: MarkSkillReviewedParams,
  { updateSkillReview }: ReviewSkillDeps,
): Promise<void> {
  await updateSkillReview({ skillId, reviewedAt: new Date(), reviewedBy: reviewerId });
}

/** Clears `reviewedAt`/`reviewedBy`, returning the skill to unreviewed. */
export async function clearSkillReview(
  { skillId }: ClearSkillReviewParams,
  { updateSkillReview }: ReviewSkillDeps,
): Promise<void> {
  await updateSkillReview({ skillId, reviewedAt: null, reviewedBy: null });
}
