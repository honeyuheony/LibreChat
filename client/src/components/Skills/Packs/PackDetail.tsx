import { useState } from 'react';
import { Spinner, OGDialogTitle, OGDialogContent, useToastContext } from '@librechat/client';
import type { TSkillStatesResponse, TSkillSummary } from 'librechat-data-provider';
import {
  useGetSkillPackQuery,
  useDeleteSkillPackMutation,
  useUpdateSkillStatesMutation,
} from '~/data-provider';
import { resolveSkillDefaultActive } from '~/hooks/Skills/useSkillActiveState';
import { formatCount, getSkillTitle } from '../Marketplace/skillCategories';
import { useLocalize, useSkillActiveState } from '~/hooks';
import ExportButton from '../Marketplace/ExportButton';
import { byLine } from '../Marketplace/SkillMeta';
import SkillIcon from '../Marketplace/SkillIcon';
import PackTree, { packPaths } from './PackTree';
import usePackStats from './stats';

type PackDetailProps = {
  packId: string;
  /** 마켓이 이미 불러온 목록. 팩에 든 스킬 가운데 볼 수 있는 것만 여기서 찾는다. */
  skills: TSkillSummary[];
  userId?: string;
  onSelectSkill: (skill: TSkillSummary) => void;
  onDeleted: () => void;
};

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-l border-border-light px-2 first:border-l-0">
      <b className="block text-[21px] font-extrabold tabular-nums">{value}</b>
      <small className="text-xs text-text-muted">{label}</small>
    </div>
  );
}

/** 꺼진 스킬을 켠 설정 전체. 켠 값이 기본값과 같으면 예외 목록에서 뺀다(useSkillActiveState 와 같은 규칙). */
function activateAll(
  states: TSkillStatesResponse,
  off: TSkillSummary[],
  userId: string,
  defaultActiveOnShare: boolean,
): TSkillStatesResponse {
  const next = { ...states };
  for (const skill of off) {
    if (resolveSkillDefaultActive(skill, userId, defaultActiveOnShare)) {
      delete next[skill._id];
    } else {
      next[skill._id] = true;
    }
  }
  return next;
}

/** 팩 상세 창: agent 수·합계 실행·MCP 서버, 들어 있는 agent, 모두 켜기. */
export default function PackDetail({
  packId,
  skills,
  userId,
  onSelectSkill,
  onDeleted,
}: PackDetailProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [treeOpen, setTreeOpen] = useState(false);
  const packQuery = useGetSkillPackQuery(packId);
  const deleteMutation = useDeleteSkillPackMutation();
  const updateStates = useUpdateSkillStatesMutation();
  const { skillStates, defaultActiveOnShare, isActive, isLoading } = useSkillActiveState();
  const pack = packQuery.data;

  const { packSkills, totalRuns, union, probes } = usePackStats(pack?.skillIds, skills);

  if (packQuery.isLoading) {
    return (
      <OGDialogContent className="flex w-[680px] max-w-[94vw] justify-center p-10">
        <OGDialogTitle className="sr-only">{localize('com_skills_pack')}</OGDialogTitle>
        <Spinner className="size-6 text-text-primary" />
      </OGDialogContent>
    );
  }
  if (!pack) {
    return (
      <OGDialogContent className="w-[680px] max-w-[94vw] p-10 text-center">
        <OGDialogTitle className="text-base">{localize('com_ui_error')}</OGDialogTitle>
      </OGDialogContent>
    );
  }

  const isAuthor = !!userId && pack.author === userId;

  const addAll = async () => {
    const off = packSkills.filter((skill) => !isActive(skill));
    if (off.length > 0) {
      try {
        await updateStates.mutateAsync(
          activateAll(skillStates, off, userId ?? '', defaultActiveOnShare),
        );
      } catch {
        showToast({ status: 'error', message: localize('com_ui_error') });
        return;
      }
    }
    showToast({ status: 'success', message: localize('com_skills_pack_added_all') });
  };

  const remove = async () => {
    try {
      await deleteMutation.mutateAsync({ id: pack._id });
      onDeleted();
    } catch {
      showToast({ status: 'error', message: localize('com_ui_error') });
    }
  };

  return (
    <OGDialogContent className="flex max-h-[92vh] w-[680px] max-w-[94vw] flex-col gap-0 overflow-hidden p-0 text-center">
      {probes}
      <div className="min-h-0 flex-1 overflow-y-auto px-[34px] pb-3.5 pt-[34px]">
        <span className="inline-flex -space-x-3">
          {packSkills.slice(0, 3).map((skill) => (
            <SkillIcon
              key={skill._id}
              skill={skill}
              size="m"
              className="ring-4 ring-surface-primary"
            />
          ))}
        </span>
        <OGDialogTitle className="mb-1 mt-4 text-[25px] font-bold leading-tight">
          {pack.name}
        </OGDialogTitle>
        <div className="text-xs text-text-muted">
          {localize('com_skills_builder_by', { name: pack.authorName })}
        </div>
        {pack.description && (
          <p className="mx-auto mt-2.5 max-w-[440px] text-[14.5px] leading-relaxed text-text-tertiary">
            {pack.description}
          </p>
        )}

        <div className="mb-1 mt-5 grid grid-cols-3 border-y border-border-light py-3.5">
          <StatCell
            value={formatCount(packSkills.length)}
            label={localize('com_skills_pack_agent_count')}
          />
          <StatCell value={formatCount(totalRuns)} label={localize('com_skills_pack_total_runs')} />
          <StatCell
            value={formatCount(union.length)}
            label={[localize('com_skills_pack_mcp_servers'), union.join(', ')]
              .filter(Boolean)
              .join(' · ')}
          />
        </div>

        <section className="mt-[18px] text-left">
          <h4 className="mb-2 text-sm font-bold">{localize('com_skills_pack_included')}</h4>
          {packSkills.map((skill) => (
            <button
              key={skill._id}
              type="button"
              onClick={() => onSelectSkill(skill)}
              className="flex w-full items-center gap-3.5 rounded-[18px] px-1.5 py-2 text-left hover:bg-surface-tertiary"
            >
              <SkillIcon skill={skill} />
              <span className="min-w-0 flex-1">
                <b className="block text-[15.5px] font-bold">{getSkillTitle(skill)}</b>
                <span className="mt-[3px] block text-xs text-text-muted">
                  {byLine(skill, localize, { withRuns: true })}
                </span>
              </span>
            </button>
          ))}
        </section>

        <section className="mt-[18px] text-left">
          <button
            type="button"
            aria-expanded={treeOpen}
            onClick={() => setTreeOpen((open) => !open)}
            className="text-sm font-bold"
          >
            {treeOpen ? '▾' : '▸'} {localize('com_skills_pack_tree_show')}
          </button>
          {treeOpen ? (
            <div className="mt-2">
              <PackTree
                root={pack.slug}
                paths={packPaths(
                  packSkills.map((skill) => skill.name),
                  union.length > 0,
                )}
              />
            </div>
          ) : (
            <p className="mt-1 text-[13px] text-text-muted">
              {localize('com_skills_pack_tree_hint')}
            </p>
          )}
        </section>
      </div>

      <div className="flex items-center gap-2 border-t border-border-light bg-surface-secondary px-[18px] py-3">
        {isAuthor && (
          <button
            type="button"
            disabled={deleteMutation.isLoading}
            onClick={() => void remove()}
            className="rounded-full px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            {localize('com_skills_pack_delete')}
          </button>
        )}
        <span className="flex-1" />
        <ExportButton
          kind="pack"
          id={pack._id}
          fileName={`${pack.slug}.zip`}
          className="border-border-medium bg-surface-primary px-3.5 py-1.5 text-[14.5px] text-text-secondary"
        />
        <button
          type="button"
          disabled={isLoading || updateStates.isLoading || packSkills.length === 0}
          onClick={() => void addAll()}
          className="rounded-full bg-surface-submit px-[26px] py-[9px] text-[15px] font-medium text-white hover:bg-surface-submit-hover disabled:opacity-50"
        >
          {localize('com_skills_pack_add_all')}
        </button>
      </div>
    </OGDialogContent>
  );
}
