import { memo, useCallback, useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
import { SkillsScope, resolveAgentSkillsScope } from 'librechat-data-provider';
import type { Agent, TSkillSummary } from 'librechat-data-provider';
import { filterSkillsForPopover } from '~/components/Chat/Input/SkillsCommand';
import { isEphemeralAgent, mainTextareaId } from '~/common';
import { useLocalize, useSkillActiveState } from '~/hooks';
import { useSkillsInfiniteQuery } from '~/data-provider';
import store, { ephemeralAgentByConvoId } from '~/store';
import { useAgentsMapContext } from '~/Providers';
import { cn } from '~/utils';

/** 빈 대화에는 스킬을 최대 네 개 추천하고, 나머지는 `$` popover에서 보여 준다. */
const MAX_SUGGESTIONS = 4;

type AgentSkillScope = Pick<Agent, 'skills' | 'skills_enabled' | 'skills_scope'>;

/** undefined는 제한 없음, 빈 배열은 선택한 agent가 실행할 스킬이 없음을 뜻한다. */
export function resolveSuggestableSkillIds(
  agentId: string | null | undefined,
  agentsMap: Record<string, AgentSkillScope | undefined> | undefined,
): string[] | undefined {
  if (!agentId || isEphemeralAgent(agentId)) {
    return undefined;
  }
  const agent = agentsMap?.[agentId];
  if (!agent || agent.skills_enabled !== true) {
    return [];
  }
  const scope = resolveAgentSkillsScope(agent.skills, agent.skills_enabled, agent.skills_scope);
  if (scope === SkillsScope.none) {
    return [];
  }
  if (scope === SkillsScope.all) {
    return undefined;
  }
  return agent.skills ?? [];
}

function LandingSkills({
  conversationId,
  agentId,
  className,
}: {
  conversationId: string;
  agentId?: string | null;
  className?: string;
}) {
  const localize = useLocalize();
  const agentsMap = useAgentsMapContext();
  const { isActive } = useSkillActiveState();
  const { data } = useSkillsInfiniteQuery({ limit: 50 });
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(conversationId));
  const setPendingManualSkills = useSetRecoilState(
    store.pendingManualSkillsByConvoId(conversationId),
  );

  const suggestions = useMemo<TSkillSummary[]>(() => {
    const firstPage = data?.pages[0]?.skills ?? [];
    const agentSkillIds = resolveSuggestableSkillIds(agentId, agentsMap);
    return filterSkillsForPopover(firstPage, { agentSkillIds, isActive }).slice(0, MAX_SUGGESTIONS);
  }, [data?.pages, agentId, agentsMap, isActive]);

  const queueSkill = useCallback(
    (skillName: string) => {
      setEphemeralAgent((prev) => (prev?.skills ? prev : { ...(prev || {}), skills: true }));
      setPendingManualSkills((prev) => (prev.includes(skillName) ? prev : [...prev, skillName]));
      document.getElementById(mainTextareaId)?.focus();
    },
    [setEphemeralAgent, setPendingManualSkills],
  );

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label={localize('com_ui_landing_suggested_skills')}
      className={cn('flex flex-wrap justify-center gap-2.5 px-4 pb-2', className)}
    >
      {suggestions.map((skill) => (
        <button
          key={skill._id}
          type="button"
          onClick={() => queueSkill(skill.name)}
          className="flex h-[38px] max-w-full items-center gap-2 rounded-theme-control border border-border-light bg-surface-primary px-3.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        >
          <ScrollText className="size-4 flex-shrink-0 text-accent-primary" aria-hidden="true" />
          <span className="truncate">{skill.displayTitle ?? skill.name}</span>
        </button>
      ))}
    </div>
  );
}

export default memo(LandingSkills);
