import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BuilderField, ChangedField } from './state';
import { EMOJI_FONT } from '../Marketplace/SkillIcon';
import { cn } from '~/utils';

type EditTarget = BuilderField;

/** 미리보기 블록 이름. 입력칸에 초점이 가면 그 칸이 채우는 블록을 강조한다. */
export type PreviewBlock = 'head' | 'when' | 'how' | 'out' | 'data';

const BLOCK_OF: Record<EditTarget, PreviewBlock> = {
  title: 'head',
  description: 'head',
  icon: 'head',
  triggers: 'when',
  output: 'out',
  extras: 'out',
  fields: 'out',
};

export const EMOJI_STYLE = { fontFamily: EMOJI_FONT };

export const NO_CHANGES: ReadonlySet<ChangedField> = new Set();
export const NO_CHOICES: string[] = [];
export const ignoreActivate = () => undefined;

export const blockFrame = (active: boolean) =>
  cn(
    'rounded-[14px] border-[1.5px] bg-surface-primary transition-[border-color,box-shadow] motion-reduce:transition-none',
    active ? 'border-ring-primary ring-[3px] ring-border-brand' : 'border-border-light',
  );

/** 강조된 블록이 보이도록 오른쪽 칸을 필요한 만큼만 굴린다. */
export function useRevealWhenActive(active: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [active]);
  return ref;
}

/** 편집을 시작한 칸의 블록을 함께 강조한다. */
export function useEditing(onActivate: (block: PreviewBlock) => void) {
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const startEdit = (target: EditTarget | null) => {
    setEditing(target);
    if (target) {
      onActivate(BLOCK_OF[target]);
    }
  };
  return [editing, startEdit] as const;
}

const splitList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function Block({
  title,
  children,
  active = false,
}: {
  title: ReactNode;
  children: ReactNode;
  active?: boolean;
}) {
  const ref = useRevealWhenActive(active);
  return (
    <section ref={ref} data-active={active} className={cn(blockFrame(active), 'px-[14px] py-3')}>
      <h5 className="mb-1.5 flex items-center gap-1 text-xs font-bold text-text-muted">{title}</h5>
      {children}
    </section>
  );
}

export function Ghost({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-text-muted/60', className)}>{children}</span>;
}

export function EditButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        'border-b border-dashed border-border-medium text-start hover:border-border-heavy hover:bg-surface-hover',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function InlineInput({
  label,
  value,
  placeholder,
  onChange,
  onDone,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  return (
    <input
      ref={inputRef}
      type="text"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Escape') {
          onDone();
        }
      }}
      className="w-full rounded-lg border border-border-medium bg-surface-primary px-2 py-1 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
    />
  );
}

/** 목록 필드는 입력 중인 글(쉼표 뒤 빈칸 포함)을 따로 들고 있다가 목록으로 바꿔 올린다. */
export function ListInput({
  label,
  values,
  placeholder,
  onChange,
  onDone,
}: {
  label: string;
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState(values.join(', '));
  return (
    <InlineInput
      label={label}
      value={typed}
      placeholder={placeholder}
      onChange={(value) => {
        setTyped(value);
        onChange(splitList(value));
      }}
      onDone={onDone}
    />
  );
}
