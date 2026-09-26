import { useId } from 'react';
import { cn } from '~/utils';

/**
 * The AgentHub mark: three white dots on a violet-to-pink rounded square, the same
 * drawing as `assets/logo.svg`. Drawn inline so it scales with `className` and keeps
 * its own colors on both the dark sidebar and the light page.
 */
export default function BrandMark({ className }: { className?: string }) {
  /** Two marks on one page (sidebar and greeting) must not share a gradient id. */
  const gradientId = `brand-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 36 36"
      className={cn('inline-block flex-shrink-0', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#db2777" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="12" fill={`url(#${gradientId})`} />
      <g fill="#fff">
        <circle cx="18" cy="10.08" r="3.6" />
        <circle cx="9.72" cy="25.2" r="3.6" />
        <circle cx="26.28" cy="25.2" r="3.6" />
      </g>
    </svg>
  );
}
