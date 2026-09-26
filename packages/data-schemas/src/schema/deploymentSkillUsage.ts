import { Schema } from 'mongoose';
import type { IDeploymentSkillUsageDocument } from '~/types/skill';

/**
 * 배포 스킬(SKILL.md 파일에서 읽어 MongoDB `Skill`에 없는 스킬)의 실행 기록. `Skill` 문서의
 * `useCount`·`runTimeTotalSeconds`·`runTimeSampleCount`와 같은 원래 값을 스킬 id별로 쌓는다.
 * 배포 스킬은 모든 테넌트에 같은 파일로 뜨므로 테넌트로 나누지 않는다.
 */
const deploymentSkillUsageSchema: Schema<IDeploymentSkillUsageDocument> =
  new Schema<IDeploymentSkillUsageDocument>(
    {
      skillId: {
        type: Schema.Types.ObjectId,
        required: true,
        unique: true,
      },
      /** 사람이 DB를 볼 때 알아보도록 남기는 스킬 이름. 조회 기준은 `skillId`다. */
      name: {
        type: String,
        maxlength: 64,
      },
      useCount: {
        type: Number,
        default: 0,
        min: 0,
      },
      runTimeTotalSeconds: {
        type: Number,
        default: 0,
        min: 0,
      },
      runTimeSampleCount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    {
      timestamps: true,
    },
  );

export default deploymentSkillUsageSchema;
