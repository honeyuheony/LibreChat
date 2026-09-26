import React from 'react';
import { cn } from '~/utils';

interface SkillCategoryTabsProps {
  tabs: Array<{ value: string; label: string }>;
  activeTab: string;
  onChange: (value: string) => void;
}

/** 와이어프레임 `.cats`: 가운데 정렬 알약 탭, 스크롤해도 위에 붙어 있다. */
export default function SkillCategoryTabs({ tabs, activeTab, onChange }: SkillCategoryTabsProps) {
  return (
    <div
      className="sticky top-0 z-[3] mt-[22px] flex flex-wrap justify-center gap-1 border-b border-border-light bg-presentation py-2.5"
      role="tablist"
      aria-orientation="horizontal"
    >
      {tabs.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          id={`skill-category-tab-${value}`}
          onClick={() => onChange(value)}
          className={cn(
            'cursor-pointer select-none whitespace-nowrap rounded-full px-[15px] py-2 text-sm font-medium transition-colors',
            activeTab === value
              ? 'bg-text-primary text-surface-primary'
              : 'text-text-tertiary hover:bg-surface-hover',
          )}
          role="tab"
          aria-selected={activeTab === value}
          aria-controls={`skill-category-panel-${value}`}
          tabIndex={activeTab === value ? 0 : -1}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
