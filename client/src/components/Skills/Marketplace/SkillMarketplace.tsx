import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { OGDialog, Spinner, useMediaQuery } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TSkillSummary } from 'librechat-data-provider';
import {
  MINE_TAB,
  PACKS_TAB,
  POPULAR_TAB,
  SKILL_CATEGORIES,
  formatCount,
  getCategoryLabel,
  getSkillTitle,
  isBaseSkill,
  isOwnSkill,
  runsOf,
  sortByRuns,
  sumSavedHours,
} from './skillCategories';
import { useAuthContext, useDocumentTitle, useHasAccess, useLocalize } from '~/hooks';
import { useGetEndpointsQuery, useSkillsInfiniteQuery } from '~/data-provider';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import { PackCreate, PackDetail, PackList } from '../Packs';
import { SidePanelGroup } from '~/components/SidePanel';
import SkillDetailContent from './SkillDetailContent';
import SkillCategoryTabs from './SkillCategoryTabs';
import SkillRankRow from './SkillRankRow';

const BASE_PATH = '/skills-market';
const CREATE_PATH = '/skills/new';
const POPULAR_LIMIT = 10;

/**
 * Agent 마켓(와이어프레임 v29 `renderAgents`): 머리 · 누적 지표 · 분류 탭 · 순위 목록 · 상세 창.
 * 목록 전체를 한 번 불러와 탭과 지표를 클라이언트에서 계산한다.
 */
export default function SkillMarketplace() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { category } = useParams();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const activeTab = category || POPULAR_TAB;
  const userId = user?.id;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [creatingPack, setCreatingPack] = useState(false);

  useDocumentTitle(`${localize('com_skills_marketplace')} | LibreChat`);
  useGetEndpointsQuery();

  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useSkillsInfiniteQuery({ limit: 100 });

  /* Load every page so tabs, ranks and totals cover the full catalog (same as SkillsCommand). */
  useEffect(() => {
    if (!isError && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const allSkills = useMemo<TSkillSummary[]>(
    () => (data?.pages ? data.pages.flatMap((page) => page.skills) : []),
    [data?.pages],
  );
  const madeSkills = useMemo(() => allSkills.filter((skill) => !isBaseSkill(skill)), [allSkills]);
  const mySkills = useMemo(
    () =>
      allSkills
        .filter((skill) => isOwnSkill(skill, userId))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [allSkills, userId],
  );
  const titleById = useMemo(
    () => new Map(allSkills.map((skill) => [skill._id, getSkillTitle(skill)])),
    [allSkills],
  );
  const selectedSkill = selectedId
    ? allSkills.find((skill) => skill._id === selectedId)
    : undefined;

  const hasAccessToSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    if (!hasAccessToSkills) {
      timeoutId = setTimeout(() => navigate('/c/new'), 1000);
    }
    return () => clearTimeout(timeoutId);
  }, [hasAccessToSkills, navigate]);

  if (!hasAccessToSkills) {
    return null;
  }

  const handleTabChange = (value: string) => {
    if (value !== activeTab) {
      navigate(value === POPULAR_TAB ? BASE_PATH : `${BASE_PATH}/${encodeURIComponent(value)}`);
    }
  };
  const selectSkill = (skill: TSkillSummary) => setSelectedId(skill._id);
  const originTitle = (skill: TSkillSummary) =>
    skill.forkOf ? (titleById.get(skill.forkOf) ?? null) : undefined;

  const tabs = [
    { value: POPULAR_TAB, label: localize('com_skills_tab_popular') },
    { value: PACKS_TAB, label: localize('com_skills_pack') },
    ...SKILL_CATEGORIES.map((value) => ({ value, label: getCategoryLabel(value, localize) })),
    { value: MINE_TAB, label: localize('com_skills_tab_mine') },
  ];

  let tabContent: React.ReactNode;
  if (activeTab === POPULAR_TAB) {
    tabContent = (
      <>
        <div className="mx-auto mt-[30px] max-w-[760px]">
          <h2 className="mb-0.5 text-[21px] font-bold text-text-primary">
            {localize('com_skills_popular_title', { count: POPULAR_LIMIT })}
          </h2>
          <div className="mb-2.5 text-[13.5px] text-text-muted">
            {localize('com_skills_popular_subtitle')}
          </div>
          <RankList
            skills={sortByRuns(madeSkills).slice(0, POPULAR_LIMIT)}
            numbered
            userId={userId}
            onSelect={selectSkill}
            emptyLabel={localize('com_skills_empty')}
          />
        </div>
        <div className="mt-3.5 text-center text-sm text-text-muted">
          {localize('com_skills_popular_note')}
        </div>
      </>
    );
  } else if (activeTab === PACKS_TAB) {
    tabContent = <PackList onOpen={setSelectedPackId} onCreate={() => setCreatingPack(true)} />;
  } else if (activeTab === MINE_TAB) {
    const runs = mySkills.reduce((sum, skill) => sum + runsOf(skill), 0);
    const forks = mySkills.reduce((sum, skill) => sum + (skill.forkCount ?? 0), 0);
    tabContent = (
      <section className="mt-8">
        <h2 className="mb-0.5 text-[22px] font-bold text-text-primary">
          {localize('com_skills_mine_title', { count: mySkills.length })}
        </h2>
        <div className="mb-3.5 text-[13.5px] text-text-muted">
          {mySkills.length > 0
            ? localize('com_skills_mine_summary', {
                runs: formatCount(runs),
                forks: formatCount(forks),
                hours: formatCount(sumSavedHours(mySkills)),
              })
            : localize('com_skills_mine_empty')}
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 md:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate(CREATE_PATH)}
            className="flex items-center gap-3.5 rounded-[18px] border-[1.5px] border-dashed border-border-medium px-2.5 py-3 text-left hover:border-[#a78bfa] hover:bg-surface-brand-subtle"
          >
            <span className="inline-flex size-[46px] flex-none items-center justify-center rounded-full bg-[#ede9fe] text-[22px] text-[#6d28d9]">
              {'＋'}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[15.5px] font-bold">{localize('com_skills_new_agent')}</b>
              <span className="text-[13.5px] text-text-tertiary">
                {localize('com_skills_new_agent_hint')}
              </span>
            </span>
          </button>
        </div>
        <RankList
          skills={mySkills}
          twoColumns
          userId={userId}
          detailedByLine
          originTitle={originTitle}
          onSelect={selectSkill}
        />
      </section>
    );
  } else {
    const list = sortByRuns(allSkills.filter((skill) => skill.category === activeTab));
    tabContent = (
      <section className="mt-8">
        <h2 className="mb-0.5 text-[22px] font-bold text-text-primary">
          {getCategoryLabel(activeTab, localize)}
        </h2>
        <div className="mb-3.5 text-[13.5px] text-text-muted">
          {localize('com_skills_category_subtitle', { count: list.length })}
        </div>
        <RankList
          skills={list}
          numbered
          twoColumns
          userId={userId}
          detailedByLine
          originTitle={originTitle}
          onSelect={selectSkill}
          emptyLabel={localize('com_skills_empty')}
        />
      </section>
    );
  }

  const madeRuns = madeSkills.reduce((sum, skill) => sum + runsOf(skill), 0);

  return (
    <div className="relative flex w-full grow overflow-hidden bg-presentation">
      <SidePanelGroup>
        <main className="flex h-full flex-col overflow-hidden" role="main">
          <div className="scrollbar-gutter-stable relative flex h-full flex-col overflow-y-auto overflow-x-hidden">
            <div className="mx-auto w-full max-w-[1000px] px-6 pb-[70px]">
              {isSmallScreen && (
                <div className="mt-3 flex items-center gap-2">
                  <OpenSidebar />
                </div>
              )}
              <div className="bg-[radial-gradient(ellipse_50%_70%_at_50%_0%,rgba(124,58,237,0.10),transparent_70%)] pb-1.5 pt-[38px] text-center">
                <h1 className="mb-2.5 text-[28px] font-extrabold tracking-[-0.04em] text-text-primary md:text-[40px]">
                  {localize('com_skills_hero_before')}
                  <em className="bg-gradient-to-br from-[#8b5cf6] to-[#db2777] bg-clip-text not-italic text-transparent">
                    {localize('com_skills_hero_highlight')}
                  </em>
                  {localize('com_skills_hero_after')}
                </h1>
                <p className="mx-auto mb-[22px] text-[15px] leading-[1.55] text-text-muted">
                  {localize('com_skills_hero_subtitle')}
                </p>
                <div className="flex flex-wrap justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => navigate(CREATE_PATH)}
                    className="rounded-full bg-surface-submit px-[26px] py-3 text-[15.5px] font-semibold text-white shadow-md hover:bg-surface-submit-hover"
                  >
                    {localize('com_skills_create_agent')}
                  </button>
                </div>
                <div className="mt-[18px] inline-flex flex-wrap justify-center gap-x-[22px] gap-y-1.5 rounded-full border border-border-light bg-surface-primary px-[18px] py-[9px] text-[13.5px] text-text-tertiary">
                  <span>
                    {localize('com_skills_impact_agents')}{' '}
                    <b className="font-semibold text-text-primary">
                      {localize('com_skills_count_unit', { count: madeSkills.length })}
                    </b>
                  </span>
                  <span>
                    {localize('com_skills_impact_runs')}{' '}
                    <b className="font-semibold text-text-primary">
                      {localize('com_skills_runs_unit', { value: formatCount(madeRuns) })}
                    </b>
                  </span>
                  <span>
                    {localize('com_skills_impact_saved')}{' '}
                    <b className="font-semibold text-text-primary">
                      {localize('com_skills_hours_unit', {
                        value: formatCount(sumSavedHours(madeSkills)),
                      })}
                    </b>{' '}
                    <small className="text-[11px] text-[rgb(var(--border-heavy))]">
                      {localize('com_skills_estimate')}
                    </small>
                  </span>
                </div>
              </div>
              <SkillCategoryTabs tabs={tabs} activeTab={activeTab} onChange={handleTabChange} />
              <div
                role="tabpanel"
                id={`skill-category-panel-${activeTab}`}
                aria-labelledby={`skill-category-tab-${activeTab}`}
                aria-busy={isLoading}
              >
                {isLoading ? (
                  <div className="flex justify-center py-12" role="status">
                    <Spinner className="h-6 w-6 text-text-primary" />
                  </div>
                ) : (
                  tabContent
                )}
              </div>
            </div>
          </div>
        </main>
      </SidePanelGroup>
      <OGDialog open={selectedSkill != null} onOpenChange={(open) => !open && setSelectedId(null)}>
        {selectedSkill && (
          <SkillDetailContent
            key={selectedSkill._id}
            skill={selectedSkill}
            allSkills={allSkills}
            userId={userId}
            onSelectSkill={selectSkill}
          />
        )}
      </OGDialog>
      <OGDialog
        open={selectedPackId != null}
        onOpenChange={(open) => !open && setSelectedPackId(null)}
      >
        {selectedPackId && (
          <PackDetail
            key={selectedPackId}
            packId={selectedPackId}
            skills={allSkills}
            userId={userId}
            onSelectSkill={(skill) => {
              setSelectedPackId(null);
              selectSkill(skill);
            }}
            onDeleted={() => setSelectedPackId(null)}
          />
        )}
      </OGDialog>
      <OGDialog open={creatingPack} onOpenChange={setCreatingPack}>
        {creatingPack && (
          <PackCreate skills={allSkills} userId={userId} onClose={() => setCreatingPack(false)} />
        )}
      </OGDialog>
    </div>
  );
}

function RankList({
  skills,
  numbered = false,
  twoColumns = false,
  detailedByLine = false,
  userId,
  originTitle,
  onSelect,
  emptyLabel,
}: {
  skills: TSkillSummary[];
  numbered?: boolean;
  twoColumns?: boolean;
  detailedByLine?: boolean;
  userId?: string;
  originTitle?: (skill: TSkillSummary) => string | null | undefined;
  onSelect: (skill: TSkillSummary) => void;
  emptyLabel?: string;
}) {
  if (skills.length === 0) {
    return emptyLabel ? (
      <div className="py-8 text-center text-sm text-text-muted" role="status">
        {emptyLabel}
      </div>
    ) : null;
  }
  return (
    <div
      role="grid"
      className={
        twoColumns ? 'grid grid-cols-1 gap-x-6 gap-y-0.5 md:grid-cols-2' : 'flex flex-col gap-0.5'
      }
    >
      {skills.map((skill, index) => (
        <SkillRankRow
          key={skill._id}
          skill={skill}
          rank={numbered ? index + 1 : undefined}
          userId={userId}
          detailedByLine={detailedByLine}
          originTitle={originTitle?.(skill)}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
