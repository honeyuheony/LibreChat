import React from 'react';
import { useMediaQuery } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { getCategoryLabel } from './skillCategories';
import { cn } from '~/utils';

interface SkillCategoryTabsProps {
  categories: string[];
  activeTab: string;
  onChange: (value: string) => void;
  /** Per-category skill count from `GET /api/skills/categories`, shown next to the label. */
  counts?: Record<string, number>;
}

/** Same look as the agent marketplace tabs, but fed with plain category values
 *  derived on the client (see skillCategories.ts). */
export default function SkillCategoryTabs({
  categories,
  activeTab,
  onChange,
  counts,
}: SkillCategoryTabsProps) {
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <div className="w-full pb-2">
      <div
        className={cn(
          'px-4',
          isSmallScreen
            ? 'scrollbar-hide flex gap-2 overflow-x-auto scroll-smooth'
            : 'flex flex-wrap justify-center gap-1.5',
        )}
        role="tablist"
        aria-orientation="horizontal"
      >
        {categories.map((value) => (
          <button
            key={value}
            id={`skill-category-tab-${value}`}
            onClick={() => onChange(value)}
            className={cn(
              'relative cursor-pointer select-none whitespace-nowrap px-3 py-2 transition-all duration-200',
              isSmallScreen ? 'min-w-fit flex-shrink-0' : '',
              activeTab === value
                ? 'rounded-t-lg bg-surface-hover text-text-primary'
                : 'rounded-lg bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary active:scale-95',
            )}
            role="tab"
            aria-selected={activeTab === value}
            aria-controls={`skill-category-panel-${value}`}
            tabIndex={activeTab === value ? 0 : -1}
          >
            {getCategoryLabel(value, localize)}
            {counts?.[value] !== undefined && (
              <span className="ml-1.5 text-xs text-text-secondary">{counts[value]}</span>
            )}
            {activeTab === value && (
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-text-primary"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
