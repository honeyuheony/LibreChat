import React, { useId, useState } from 'react';
import { useSetRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { Constants } from 'librechat-data-provider';
import { Label, Spinner, Switch, OGDialogTitle, OGDialogContent } from '@librechat/client';
import type { TSkillSummary } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import {
  formatCount,
  getCategoryLabel,
  getSkillSummary,
  getSkillTitle,
  runsOf,
  savedHoursOf,
} from './skillCategories';
import { SkillTags, Tag, authorLine, byLine, visibilityLabel } from './SkillMeta';
import { useLocalize, useSkillActiveState } from '~/hooks';
import { parseFrontmatter } from '../utils/frontmatter';
import { useGetSkillQuery } from '~/data-provider';
import { ephemeralAgentByConvoId } from '~/store';
import SkillFolderTree from './SkillFolderTree';
import SkillIcon from './SkillIcon';
import store from '~/store';

interface SkillDetailContentProps {
  skill: TSkillSummary;
  /** 응용 계보(원본·사본)를 찾을 목록. */
  allSkills: TSkillSummary[];
  userId?: string;
  onSelectSkill: (skill: TSkillSummary) => void;
}

/** 와이어프레임 `pvBlock`: 제목이 작게 붙은 테두리 칸. */
/** SKILL.md 본문은 보통 `# 제목` 으로 시작한다. 창 머리에 이미 제목이 있으니 첫 줄의 h1 은 뺀다. */
export function stripLeadingTitle(body: string): string {
  return body.replace(/^\s*#[ \t]+[^\n]*\n?/, '');
}

const INSTRUCTION_SECTION_HEADING =
  /^(?:일하는 방법|실행 단계|실행 방법|작업 순서|업무 절차|절차|steps?|workflow|process|instructions?)$/i;

const SKILL_DETAIL_OVERLAY_CLASS =
  'bg-text-primary/40 backdrop-blur-[6px] [@media(prefers-reduced-transparency:reduce)]:bg-text-primary/60 [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none';

function extractInstructionSteps(content: string): string[] {
  const instructionSection = content.split(/(?=^#{1,6}\s)/m).find((section) => {
    const heading = section.match(/^#{1,6}\s+(.+)$/m)?.[1].trim();
    return heading != null && INSTRUCTION_SECTION_HEADING.test(heading);
  });
  const lines = (instructionSection ?? content)
    .split(/\r?\n/)
    .filter((line) => !/^#{1,6}\s/.test(line));
  const listItems = lines.flatMap((line) => {
    const item = line.match(/^\s*(?:\d+[.)]|[-*+])\s+(.+)$/)?.[1].trim();
    return item ? [item] : [];
  });
  if (listItems.length > 0) {
    return listItems;
  }
  return lines
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((step) => step.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-[1.5px] border-border-light bg-surface-primary px-3.5 py-3 text-left">
      <h5 className="mb-1.5 text-xs font-bold tracking-[0.02em] text-text-muted">{title}</h5>
      {children}
    </div>
  );
}

function StatCell({ value, label, title }: { value: string; label: string; title?: string }) {
  return (
    <div title={title} className="border-l border-border-light first:border-l-0">
      <b className="block text-[21px] font-extrabold tabular-nums tracking-[-0.02em]">{value}</b>
      <small className="text-xs text-text-muted">{label}</small>
    </div>
  );
}

function LineageRow({
  skill,
  tag,
  originTitle,
  onSelect,
}: {
  skill: TSkillSummary;
  tag: string;
  originTitle?: string;
  onSelect: (skill: TSkillSummary) => void;
}) {
  const localize = useLocalize();
  return (
    <button
      type="button"
      onClick={() => onSelect(skill)}
      className="flex w-full items-center gap-3.5 rounded-[18px] px-1.5 py-2 text-left hover:bg-surface-tertiary"
    >
      <SkillIcon skill={skill} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[15.5px] font-bold">
          {getSkillTitle(skill)} <Tag tone="fork">{tag}</Tag>
        </div>
        <div className="mt-[3px] text-xs text-text-muted">
          {byLine(skill, localize, { withRuns: true, originTitle })}
        </div>
      </div>
    </button>
  );
}

/** 마켓 상세 창(와이어프레임 `renderAgentModal`). 채팅 시작은 `/` 목록에서 고른 것과 같게 새 대화에 스킬을 붙인다. */
export default function SkillDetailContent({
  skill,
  allSkills,
  userId,
  onSelectSkill,
}: SkillDetailContentProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const switchId = useId();
  const switchLabelId = useId();
  const [treeOpen, setTreeOpen] = useState(false);
  const { isActive, toggle, isLoading: statesLoading } = useSkillActiveState();
  const detailQuery = useGetSkillQuery(skill._id);
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(Constants.NEW_CONVO));
  const setPendingManualSkills = useSetRecoilState(
    store.pendingManualSkillsByConvoId(Constants.NEW_CONVO),
  );

  /** `prefill` 이 있으면 새 대화 입력창에 그 문장을 미리 채운다(useQueryParams 가 `prompt` 쿼리 값을 읽어 반영). */
  const startChat = (prefill?: string) => {
    setEphemeralAgent((prev) => (prev?.skills ? prev : { ...(prev || {}), skills: true }));
    setPendingManualSkills((prev) => (prev.includes(skill.name) ? prev : [...prev, skill.name]));
    navigate(prefill ? `/c/new?prompt=${encodeURIComponent(prefill)}` : '/c/new');
  };

  const title = getSkillTitle(skill);
  const summary = getSkillSummary(skill);
  const profile = skill.marketProfile;
  const origin = skill.forkOf ? allSkills.find((entry) => entry._id === skill.forkOf) : undefined;
  const forks = allSkills.filter((entry) => entry.forkOf === skill._id);
  const starters = skill.examples && skill.examples.length > 0 ? skill.examples : [summary];
  const savedHours = savedHoursOf(skill);
  const perRun = skill.usageMetrics?.savedMinutesPerRun ?? null;
  const averageSeconds = skill.usageMetrics?.averageRunSeconds ?? null;
  const formula = localize('com_skills_perf_formula', {
    manual: skill.manualMinutes ?? 0,
    seconds: averageSeconds ?? 0,
  });
  const instructions = detailQuery.data?.body
    ? stripLeadingTitle(parseFrontmatter(detailQuery.data.body).body)
    : '';
  const instructionSteps = extractInstructionSteps(instructions);
  let howContent: React.ReactNode;
  if (detailQuery.isLoading) {
    howContent = <Spinner className="size-4 text-text-primary" />;
  } else if (instructionSteps.length > 0) {
    howContent = (
      <ol className="ml-4 list-decimal space-y-0.5 text-sm leading-[1.7] text-text-secondary">
        {instructionSteps.map((step, index) => (
          <li key={`${index}-${step}`}>{step}</li>
        ))}
      </ol>
    );
  } else if (profile?.pipeline) {
    howContent = (
      <div className="text-[13px] text-text-muted">
        {localize('com_skills_pipeline', { pipeline: profile.pipeline })}
      </div>
    );
  } else {
    howContent = null;
  }
  const footnote = [
    perRun == null
      ? null
      : localize('com_skills_detail_footnote', {
          manual: skill.manualMinutes ?? 0,
          seconds: averageSeconds ?? 0,
          perRun: Math.round(perRun),
        }),
    localize('com_skills_detail_scope', {
      scope: visibilityLabel(skill, localize),
    }),
    profile?.version,
    skill.category ? getCategoryLabel(skill.category, localize) : null,
    localize('com_skills_detail_model_auto' as TranslationKeys),
  ].filter(Boolean);

  return (
    <OGDialogContent
      overlayClassName={SKILL_DETAIL_OVERLAY_CLASS}
      className="flex w-[580px] max-w-[94vw] flex-col gap-0 overflow-hidden p-0 text-center"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-[34px] pb-3.5 pt-[34px]">
        <SkillIcon skill={skill} size="l" />
        <OGDialogTitle className="mb-1 mt-4 text-[25px] font-bold leading-tight">
          {title}
        </OGDialogTitle>
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-text-muted">
          {authorLine(skill, localize, true)}
          <SkillTags skill={skill} userId={userId} />
        </div>
        <p className="mx-auto mt-2.5 max-w-[440px] text-[14.5px] leading-relaxed text-text-tertiary">
          {summary}
        </p>

        <h4 className="mt-5 text-[13px] font-semibold text-text-muted">
          {localize('com_skills_perf_heading')}
        </h4>
        <div className="mb-1 mt-1.5 grid grid-cols-4 border-y border-border-light py-3.5">
          <StatCell value={formatCount(runsOf(skill))} label={localize('com_skills_stat_runs')} />
          <StatCell
            value={savedHours == null ? '–' : `${formatCount(savedHours)}h`}
            label={localize('com_skills_stat_saved')}
          />
          <StatCell
            value={
              perRun == null ? '–' : localize('com_skills_minutes', { count: Math.round(perRun) })
            }
            label={localize('com_skills_perf_per_run')}
            title={formula}
          />
          <StatCell
            value={formatCount(skill.forkCount ?? 0)}
            label={localize('com_skills_stat_forks')}
          />
        </div>

        <section className="mt-[18px] text-left">
          <h4 className="mb-2 text-sm font-bold">{localize('com_skills_starters')}</h4>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {starters.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => startChat(starter)}
                className="rounded-[14px] border border-border-light bg-surface-primary px-[13px] py-[11px] text-left text-[13.5px] leading-[1.45] transition-colors hover:border-[#a78bfa] hover:bg-surface-brand-subtle"
              >
                {starter}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-[18px] flex flex-col gap-2.5">
          {profile?.triggers && profile.triggers.length > 0 && (
            <InfoBlock title={localize('com_skills_when')}>
              <div className="mb-1 flex flex-wrap gap-1.5">
                {profile.triggers.map((trigger) => (
                  <span
                    key={trigger}
                    className="rounded-full border border-border-brand bg-surface-brand-subtle px-2.5 py-0.5 text-[12.5px] text-[#5b21b6] dark:text-text-primary"
                  >
                    {trigger}
                  </span>
                ))}
              </div>
            </InfoBlock>
          )}
          <InfoBlock title={localize('com_skills_how')}>{howContent}</InfoBlock>
          {profile?.output && (
            <InfoBlock title={localize('com_skills_output')}>
              <b className="text-sm">{profile.output}</b>
            </InfoBlock>
          )}
          {profile?.sources && profile.sources.length > 0 && (
            <InfoBlock title={localize('com_skills_sources')}>
              <ul className="list-disc pl-5 text-[13.5px] text-text-secondary">
                {profile.sources.map((source) => (
                  <li key={source}>{source}</li>
                ))}
              </ul>
            </InfoBlock>
          )}
        </section>

        {(origin || forks.length > 0) && (
          <section className="mt-[18px] text-left">
            <h4 className="mb-2 text-sm font-bold">{localize('com_skills_lineage')}</h4>
            {origin && (
              <LineageRow
                skill={origin}
                tag={localize('com_skills_lineage_origin')}
                onSelect={onSelectSkill}
              />
            )}
            {forks.map((fork) => (
              <LineageRow
                key={fork._id}
                skill={fork}
                tag={localize('com_skills_lineage_fork')}
                originTitle={title}
                onSelect={onSelectSkill}
              />
            ))}
          </section>
        )}

        <section className="mt-[18px] text-left">
          <button
            type="button"
            aria-expanded={treeOpen}
            onClick={() => setTreeOpen((open) => !open)}
            className="text-sm font-bold"
          >
            {treeOpen ? '▾' : '▸'} {localize('com_skills_folder')}
          </button>
          {treeOpen && <SkillFolderTree skillId={skill._id} rootName={skill.name} />}
        </section>

        <p className="mt-[18px] text-left text-[12.5px] text-text-muted">{footnote.join(' · ')}</p>
      </div>

      <div className="flex items-center gap-2 border-t border-border-light bg-surface-secondary px-[18px] py-3">
        <span className="inline-flex items-center gap-1.5">
          <Switch
            id={switchId}
            aria-labelledby={switchLabelId}
            className="data-[state=checked]:bg-surface-submit"
            checked={isActive(skill)}
            disabled={statesLoading}
            onCheckedChange={() => toggle(skill)}
          />
          <Label
            id={switchLabelId}
            htmlFor={switchId}
            className="cursor-pointer text-[13px] text-text-tertiary"
          >
            {localize('com_skills_show_in_list')}
          </Label>
        </span>
        <span className="flex-1" />
        <button
          type="button"
          title={localize('com_skills_fork_hint')}
          onClick={() => navigate(`/skills/new?forkOf=${encodeURIComponent(skill._id)}`)}
          className="rounded-full border border-border-medium bg-surface-primary px-3.5 py-1.5 text-[14.5px] text-text-secondary hover:bg-surface-hover"
        >
          {localize('com_skills_fork')}
        </button>
        <button
          type="button"
          onClick={() => startChat()}
          className="rounded-full bg-surface-submit px-[26px] py-[9px] text-[15px] font-medium text-white hover:bg-surface-submit-hover"
        >
          {localize('com_skills_start_chat')}
        </button>
      </div>
    </OGDialogContent>
  );
}
