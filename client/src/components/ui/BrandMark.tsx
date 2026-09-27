import { useId } from 'react';
import { cn } from '~/utils';

/** AgentHub 로고를 인라인 SVG로 렌더링해 className에 맞춰 크기만 조절하고 색상은 유지한다. */
export default function BrandMark({ className }: { className?: string }) {
  /** 같은 화면의 로고끼리 gradient id가 겹치지 않도록 한다. */
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
