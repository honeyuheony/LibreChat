import React, { useState } from 'react';
import { BadgeCheck, ScrollText } from 'lucide-react';
import { Label, OGDialog, OGDialogTrigger } from '@librechat/client';
import type { TSkillSummary } from 'librechat-data-provider';
import { getCategoryLabel, getSkillSummary, getSkillTitle } from './skillCategories';
import SkillDetailContent from './SkillDetailContent';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface SkillCardProps {
  skill: TSkillSummary;
}

/** Card layout copied from the agent marketplace card; the skill has no avatar so a
 *  fixed icon stands in. */
export default function SkillCard({ skill }: SkillCardProps) {
  const localize = useLocalize();
  const [isOpen, setIsOpen] = useState(false);
  const title = getSkillTitle(skill);
  const summary = getSkillSummary(skill);
  const categoryLabel = skill.category ? getCategoryLabel(skill.category, localize) : '';

  return (
    <OGDialog open={isOpen} onOpenChange={setIsOpen}>
      <OGDialogTrigger asChild>
        <div
          className={cn(
            'group relative flex h-32 gap-5 overflow-hidden rounded-xl',
            'cursor-pointer select-none px-6 py-4',
            'bg-surface-tertiary transition-colors duration-150 hover:bg-surface-hover',
            'md:h-36 lg:h-40',
            '[&_*]:cursor-pointer',
          )}
          aria-label={`${title} - ${summary}`}
          tabIndex={0}
          role="button"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsOpen(true);
            }
          }}
        >
          {(skill.reviewedAt || categoryLabel) && (
            <div className="absolute right-4 top-3 flex items-center gap-1.5">
              {skill.reviewedAt && (
                <span className="flex items-center gap-1 rounded-md bg-surface-hover px-2 py-0.5 text-xs text-text-secondary">
                  <BadgeCheck className="size-3.5" aria-hidden="true" />
                  {localize('com_skills_reviewed')}
                </span>
              )}
              {categoryLabel && (
                <span className="rounded-md bg-surface-hover px-2 py-0.5 text-xs text-text-secondary">
                  {categoryLabel}
                </span>
              )}
            </div>
          )}
          <div className="flex-shrink-0 self-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-surface-secondary">
              <ScrollText className="size-6 text-status-info" aria-hidden="true" />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden">
            <Label className="line-clamp-2 text-base font-semibold text-text-primary md:text-lg">
              {title}
            </Label>
            <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-text-secondary md:line-clamp-4">
              {summary}
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              {`$${skill.name}`}
              {(skill.useCount ?? 0) > 0 &&
                ` · ${localize('com_skills_use_count', { count: skill.useCount ?? 0 })}`}
            </p>
          </div>
        </div>
      </OGDialogTrigger>
      <SkillDetailContent skill={skill} />
    </OGDialog>
  );
}
