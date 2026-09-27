import { useMemo } from 'react';
import type { TSkillSummary } from 'librechat-data-provider';
import { runsOf } from '../Marketplace/skillCategories';
import useSkillConnectors from './connectors';

export default function usePackStats(skillIds: string[] | undefined, skills: TSkillSummary[]) {
  const packSkills = useMemo(() => {
    const skillsById = new Map(skills.map((skill) => [skill._id, skill]));
    return (skillIds ?? [])
      .map((id) => skillsById.get(id))
      .filter((skill): skill is TSkillSummary => skill != null);
  }, [skillIds, skills]);
  const packSkillIds = useMemo(() => packSkills.map((skill) => skill._id), [packSkills]);
  const { union, probes } = useSkillConnectors(packSkillIds);
  const totalRuns = useMemo(
    () => packSkills.reduce((sum, skill) => sum + runsOf(skill), 0),
    [packSkills],
  );

  return { packSkills, totalRuns, union, probes };
}
