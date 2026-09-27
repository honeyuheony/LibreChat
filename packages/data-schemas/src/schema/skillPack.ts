import { Schema } from 'mongoose';
import type { Types } from 'mongoose';
import type { ISkillPackDocument } from '~/types/skillPack';

export const MAX_SKILL_PACK_SKILLS = 50;

const skillPackSchema: Schema<ISkillPackDocument> = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 128 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 2048 },
    icon: { type: String, trim: true, maxlength: 16 },
    skillIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Skill' }],
      required: true,
      validate: {
        validator: (skillIds: Types.ObjectId[]) => {
          if (
            !Array.isArray(skillIds) ||
            skillIds.length < 2 ||
            skillIds.length > MAX_SKILL_PACK_SKILLS
          ) {
            return false;
          }
          return new Set(skillIds.map((skillId) => skillId.toString())).size === skillIds.length;
        },
        message: 'A skill pack must contain between two and 50 different skills',
      },
    },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, trim: true },
    tenantId: { type: String, index: true },
  },
  { timestamps: true },
);

skillPackSchema.index({ slug: 1, tenantId: 1 }, { unique: true });
skillPackSchema.index({ createdAt: -1, _id: -1 });

export default skillPackSchema;
