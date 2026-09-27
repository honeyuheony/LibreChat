import { useMemo, useState } from 'react';
import { OGDialogTitle, OGDialogContent, useToastContext } from '@librechat/client';
import type { TSkillSummary } from 'librechat-data-provider';
import {
  formatCount,
  getSkillTitle,
  isBaseSkill,
  isOwnSkill,
  runsOf,
} from '../Marketplace/skillCategories';
import { useCreateSkillPackMutation } from '~/data-provider';
import { SkillTags } from '../Marketplace/SkillMeta';
import SkillIcon from '../Marketplace/SkillIcon';
import PackTree, { packPaths } from './PackTree';
import useSkillConnectors from './connectors';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

/** 팩에 담아야 하는 최소 agent 수. data-schemas `skillPack.ts` 스키마 검사와 같은 값이다. */
const PACK_MIN_SKILLS = 2;
const NEW_PACK_ROOT = 'new-pack';

type PackCreateProps = {
  skills: TSkillSummary[];
  userId?: string;
  onClose: () => void;
};

function SectionHead({ step, title, note }: { step: number; title: string; note?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-surface-tertiary text-xs font-bold">
        {step}
      </span>
      <b className="text-[15px] text-text-primary">{title}</b>
      {note && <span className="text-sm text-text-secondary">{note}</span>}
    </div>
  );
}

/** 팩 만들기 창: 이름·설명과 담을 agent, 오른쪽에 폴더와 MCP 서버 합집합. */
export default function PackCreate({ skills, userId, onClose }: PackCreateProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const createMutation = useCreateSkillPackMutation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  const candidates = useMemo(
    () =>
      skills
        .filter((skill) => !isBaseSkill(skill))
        .sort(
          (a, b) =>
            Number(isOwnSkill(b, userId)) - Number(isOwnSkill(a, userId)) || runsOf(b) - runsOf(a),
        ),
    [skills, userId],
  );
  const picked = useMemo(
    () => candidates.filter((skill) => pickedIds.includes(skill._id)),
    [candidates, pickedIds],
  );
  const pickedSkillIds = useMemo(() => picked.map((skill) => skill._id), [picked]);
  const { union, probes } = useSkillConnectors(pickedSkillIds);
  const ready = picked.length >= PACK_MIN_SKILLS && name.trim().length > 0;

  const toggle = (id: string) =>
    setPickedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );

  const publish = async () => {
    if (!ready) {
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        skillIds: pickedSkillIds,
      });
      showToast({ status: 'success', message: localize('com_skills_pack_created') });
      onClose();
    } catch {
      showToast({ status: 'error', message: localize('com_skills_pack_create_failed') });
    }
  };

  return (
    <OGDialogContent className="flex max-h-[92vh] w-[1000px] max-w-[96vw] flex-col gap-0 overflow-hidden p-0">
      {probes}
      <div className="flex items-center gap-3 border-b border-border-light px-5 py-3">
        <OGDialogTitle className="text-base font-semibold text-text-primary">
          {localize('com_skills_pack_create')}
        </OGDialogTitle>
        <span className="text-sm text-text-secondary">
          {localize('com_skills_pack_create_subtitle')}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <section className="mb-4">
            <SectionHead step={1} title={localize('com_skills_pack_name_desc')} />
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={name}
                aria-label={localize('com_skills_pack_name_placeholder')}
                placeholder={localize('com_skills_pack_name_placeholder')}
                onChange={(event) => setName(event.target.value)}
                className="rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              />
              <input
                type="text"
                value={description}
                aria-label={localize('com_skills_pack_desc_placeholder')}
                placeholder={localize('com_skills_pack_desc_placeholder')}
                onChange={(event) => setDescription(event.target.value)}
                className="rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              />
            </div>
          </section>
          <section>
            <SectionHead
              step={2}
              title={localize('com_skills_pack_agents')}
              note={localize('com_skills_pack_selected', { count: picked.length })}
            />
            <div className="flex flex-col gap-1">
              {candidates.map((skill) => {
                const on = pickedIds.includes(skill._id);
                const title = getSkillTitle(skill);
                return (
                  <label
                    key={skill._id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2',
                      on
                        ? 'border-border-brand bg-surface-brand-subtle'
                        : 'border-border-light hover:bg-surface-hover',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      aria-label={title}
                      onChange={() => toggle(skill._id)}
                      className="size-4"
                    />
                    <SkillIcon skill={skill} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-text-primary">
                        {title}
                        <SkillTags skill={skill} userId={userId} />
                      </span>
                      <span className="text-xs text-text-secondary">
                        {skill.authorName}
                        {skill.authorDepartment ? ` · ${skill.authorDepartment}` : ''}
                        {' · '}
                        {localize('com_skills_meta_runs', { value: formatCount(runsOf(skill)) })}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        </div>

        <div className="min-h-0 overflow-y-auto border-border-light bg-surface-secondary px-5 py-4 md:border-s">
          <h3 className="mb-2 text-base font-semibold text-text-primary">
            {localize('com_skills_pack_folder')}
          </h3>
          {picked.length > 0 ? (
            <PackTree
              root={NEW_PACK_ROOT}
              paths={packPaths(
                picked.map((skill) => skill.name),
                union.length > 0,
              )}
            />
          ) : (
            <p className="text-sm text-text-secondary">
              {localize('com_skills_pack_folder_empty')}
            </p>
          )}
          <p className="mt-2.5 text-sm text-text-secondary">
            {localize('com_skills_pack_mcp_union', {
              servers:
                picked.length > 0 && union.length > 0
                  ? union.join(', ')
                  : localize('com_skills_pack_none'),
            })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border-light bg-surface-secondary px-5 py-3">
        {picked.length < PACK_MIN_SKILLS && (
          <span className="text-sm text-text-secondary">
            {localize('com_skills_pack_min_agents')}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-3.5 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
        >
          {localize('com_ui_cancel')}
        </button>
        <button
          type="button"
          disabled={!ready || createMutation.isLoading}
          onClick={() => void publish()}
          className="rounded-full bg-surface-submit px-5 py-2 text-sm font-medium text-white hover:bg-surface-submit-hover disabled:opacity-50"
        >
          {localize('com_skills_pack_publish')}
        </button>
      </div>
    </OGDialogContent>
  );
}
