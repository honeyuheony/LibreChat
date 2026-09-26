import { Model } from 'mongoose';
import type { IDeploymentSkillUsageDocument } from '~/types/skill';
import deploymentSkillUsageSchema from '~/schema/deploymentSkillUsage';

export function createDeploymentSkillUsageModel(
  mongoose: typeof import('mongoose'),
): Model<IDeploymentSkillUsageDocument> {
  // 배포 스킬은 테넌트와 무관하게 같은 파일로 뜨므로 테넌트 격리 플러그인을 붙이지 않는다.
  return (
    mongoose.models.DeploymentSkillUsage ||
    mongoose.model<IDeploymentSkillUsageDocument>(
      'DeploymentSkillUsage',
      deploymentSkillUsageSchema,
    )
  );
}
