import { useMemo } from 'react';
import { Spinner } from '@librechat/client';
import type { TSkillPackSummary, TSkillSummary } from 'librechat-data-provider';
import { useListSkillPacksQuery, useSkillsInfiniteQuery } from '~/data-provider';
import { formatCount } from '../Marketplace/skillCategories';
import { useLocalize } from '~/hooks';
import usePackStats from './stats';

type PackListProps = {
  onOpen: (packId: string) => void;
  onCreate: () => void;
};

type PackCardProps = {
  pack: TSkillPackSummary;
  skills: TSkillSummary[];
  onOpen: (packId: string) => void;
};

const DEFAULT_PACK_ICON = '📦';
const CARD_CLASS =
  'flex items-start gap-3.5 rounded-3xl border border-border-light bg-surface-primary px-4 py-3.5 text-left hover:border-border-medium hover:bg-surface-hover';

function PackCard({ pack, skills, onOpen }: PackCardProps) {
  const localize = useLocalize();
  const { packSkills, totalRuns, union, probes } = usePackStats(pack.skillIds, skills);

  return (
    <>
      {probes}
      <button type="button" onClick={() => onOpen(pack._id)} className={CARD_CLASS}>
        <span aria-hidden="true" className="text-[30px] leading-none">
          {pack.icon || DEFAULT_PACK_ICON}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15.5px] font-bold text-text-primary">{pack.name}</b>
          {pack.description && (
            <span className="block text-[13.5px] text-text-tertiary">{pack.description}</span>
          )}
          <span className="mt-[3px] block text-xs text-text-muted">
            {localize('com_skills_builder_by', { name: pack.authorName })} ·{' '}
            {formatCount(packSkills.length)} {localize('com_skills_pack_agent_count')} ·{' '}
            {localize('com_skills_pack_total_runs')} {formatCount(totalRuns)}
            {union.length > 0 && (
              <>
                {' '}
                · {localize('com_skills_pack_mcp_servers')} {union.join(', ')}
              </>
            )}
          </span>
        </span>
      </button>
    </>
  );
}

/** 마켓 「팩」 탭: 팩 카드와 「팩 만들기」 카드. */
export default function PackList({ onOpen, onCreate }: PackListProps) {
  const localize = useLocalize();
  const { data: packs = [], isLoading, isError } = useListSkillPacksQuery();
  const { data: skillPages } = useSkillsInfiniteQuery({ limit: 100 });
  const skills = useMemo(
    () => skillPages?.pages.flatMap((page) => page.skills) ?? [],
    [skillPages?.pages],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12" role="status">
        <Spinner className="h-6 w-6 text-text-primary" />
      </div>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="mb-0.5 text-[22px] font-bold text-text-primary">
        {localize('com_skills_pack_tab_title', { count: packs.length })}
      </h2>
      <div className="mb-3.5 text-[13.5px] text-text-muted">
        {localize('com_skills_pack_tab_desc')}
      </div>
      {isError && (
        <div className="mb-3 text-sm text-text-secondary" role="alert">
          {localize('com_ui_error')}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {packs.map((pack) => (
          <PackCard key={pack._id} pack={pack} skills={skills} onOpen={onOpen} />
        ))}
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-3.5 rounded-3xl border-[1.5px] border-dashed border-border-medium px-4 py-3.5 text-left hover:bg-surface-hover"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-[68px] flex-none items-center justify-center rounded-full bg-surface-message-user text-[34px] text-accent-primary"
          >
            {'＋'}
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-[15.5px] font-bold text-text-primary">
              {localize('com_skills_pack_create')}
            </b>
            <span className="text-[13.5px] text-text-tertiary">
              {localize('com_skills_pack_create_hint')}
            </span>
          </span>
        </button>
      </div>
    </section>
  );
}
