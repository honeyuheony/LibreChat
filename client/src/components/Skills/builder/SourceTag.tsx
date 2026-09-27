import type { ReactNode } from 'react';
import { SOURCE_AI, SOURCE_ME } from './state';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type SourceTagProps = { source?: string; label?: string; children?: ReactNode };

/** 필드 출처 표시: AI가 정함 · 내가 고침 · 그 밖의 글자(「원본 그대로」 등)는 그대로 보인다. */
export default function SourceTag({ source, label, children }: SourceTagProps) {
  const localize = useLocalize();
  if (!source) {
    return null;
  }
  const known: Record<string, string> = {
    [SOURCE_AI]: localize('com_skills_builder_source_ai'),
    [SOURCE_ME]: localize('com_skills_builder_source_me'),
  };
  const text = label ?? known[source] ?? source;
  return (
    <span
      className={cn(
        'ms-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-px align-middle text-[10.5px] font-bold',
        source === SOURCE_AI && 'bg-surface-brand-subtle text-text-primary',
        source === SOURCE_ME && 'bg-status-success-subtle text-status-success',
        source !== SOURCE_AI && source !== SOURCE_ME && 'bg-surface-tertiary text-text-secondary',
      )}
    >
      {text}
      {children}
    </span>
  );
}
