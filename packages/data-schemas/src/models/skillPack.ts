import type { Model } from 'mongoose';
import type { ISkillPackDocument } from '~/types/skillPack';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import skillPackSchema from '~/schema/skillPack';

export function createSkillPackModel(
  mongoose: typeof import('mongoose'),
): Model<ISkillPackDocument> {
  applyTenantIsolation(skillPackSchema);
  return (
    mongoose.models.SkillPack || mongoose.model<ISkillPackDocument>('SkillPack', skillPackSchema)
  );
}
