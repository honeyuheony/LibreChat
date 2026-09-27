import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { TSkillDraftExtra, TSkillDraftOutput } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import type { BuilderField, BuilderState, BuilderStep, BuilderValues } from './state';
import type { TranslationKeys } from '~/hooks';
import { FIELD_OUTPUTS, ICON_CHOICES, OUTPUTS, SOURCE_AI, SOURCE_ME } from './state';
import { useLocalize } from '~/hooks';
import SourceTag from './SourceTag';
import { cn } from '~/utils';

type EditTarget = BuilderField;

type PreviewProps = {
  state: BuilderState;
  steps: BuilderStep[];
  author: string;
  onEdit: <K extends BuilderField>(field: K, value: BuilderValues[K]) => void;
  onStepOff: (step: string) => void;
  onStepsRestore: () => void;
  onToggleConnector: (name: string) => void;
};

type HeadProps = Pick<PreviewProps, 'state' | 'author' | 'onEdit'>;

const splitList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function Block({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border-light bg-surface-primary px-4 py-3">
      <h5 className="mb-1.5 flex items-center gap-1 text-xs font-bold text-text-secondary">
        {title}
      </h5>
      {children}
    </section>
  );
}

function Ghost({ children }: { children: ReactNode }) {
  return <span className="text-text-tertiary">{children}</span>;
}

function EditButton({
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

function InlineInput({
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
function ListInput({
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

const OUTPUT_CARD: Record<
  TSkillDraftOutput,
  { icon: string; label: TranslationKeys; desc: TranslationKeys }
> = {
  report: {
    icon: '📄',
    label: 'com_skills_builder_output_report',
    desc: 'com_skills_builder_output_report_desc',
  },
  organize: {
    icon: '📊',
    label: 'com_skills_builder_output_organize',
    desc: 'com_skills_builder_output_organize_desc',
  },
  summary: {
    icon: '📝',
    label: 'com_skills_builder_output_summary',
    desc: 'com_skills_builder_output_summary_desc',
  },
  draft: {
    icon: '✍️',
    label: 'com_skills_builder_output_draft',
    desc: 'com_skills_builder_output_draft_desc',
  },
  ask: {
    icon: '🔍',
    label: 'com_skills_builder_output_ask',
    desc: 'com_skills_builder_output_ask_desc',
  },
};

const EXTRA_LABEL: Record<TSkillDraftExtra, TranslationKeys> = {
  translate: 'com_skills_builder_extra_translate',
  polish: 'com_skills_builder_extra_polish',
  law: 'com_skills_builder_extra_law',
};

export function PreviewHead({ state, author, onEdit }: HeadProps) {
  const localize = useLocalize();
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const { values, sources } = state;
  const clickLabel = localize('com_skills_builder_click_to_edit');
  const done = () => setEditing(null);

  return (
    <section className="flex items-center gap-3.5 rounded-xl border border-border-light bg-surface-primary px-4 py-3">
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          title={localize('com_skills_builder_icon_change')}
          aria-label={localize('com_skills_builder_icon_change')}
          onClick={() => setEditing(editing === 'icon' ? null : 'icon')}
          className="flex size-12 items-center justify-center rounded-xl bg-surface-tertiary text-2xl"
        >
          <span aria-hidden="true">{values.icon || '🤖'}</span>
        </button>
      </div>
      <div className="min-w-0 flex-1">
        {editing === 'icon' && (
          <div className="mb-2 flex flex-wrap gap-1.5" role="group">
            {ICON_CHOICES.map((icon) => (
              <button
                key={icon}
                type="button"
                aria-pressed={values.icon === icon}
                onClick={() => {
                  onEdit('icon', icon);
                  done();
                }}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full border text-lg',
                  values.icon === icon
                    ? 'border-border-brand bg-surface-brand-subtle'
                    : 'border-border-light bg-surface-primary',
                )}
              >
                {icon}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          {editing === 'title' ? (
            <InlineInput
              label={localize('com_skills_builder_name_placeholder')}
              value={values.title}
              placeholder={localize('com_skills_builder_name_placeholder')}
              onChange={(value) => onEdit('title', value)}
              onDone={done}
            />
          ) : (
            <h3 className="text-lg font-semibold text-text-primary">
              <EditButton label={clickLabel} onClick={() => setEditing('title')}>
                {values.title || <Ghost>{localize('com_skills_builder_name_ghost')}</Ghost>}
              </EditButton>
            </h3>
          )}
          <SourceTag source={sources.title} />
        </div>
        <div className="text-xs text-text-secondary">
          {localize('com_skills_builder_by', { name: author })}
        </div>
        <div className="mt-1 flex items-center gap-1">
          {editing === 'description' ? (
            <InlineInput
              label={localize('com_skills_builder_desc_placeholder')}
              value={values.description}
              placeholder={localize('com_skills_builder_desc_placeholder')}
              onChange={(value) => onEdit('description', value)}
              onDone={done}
            />
          ) : (
            <p className="text-sm text-text-secondary">
              <EditButton label={clickLabel} onClick={() => setEditing('description')}>
                {values.description || <Ghost>{localize('com_skills_builder_desc_ghost')}</Ghost>}
              </EditButton>
            </p>
          )}
          <SourceTag source={sources.description} />
        </div>
      </div>
    </section>
  );
}

function StepTag({ by, onRemove }: { by: string; onRemove: () => void }) {
  const localize = useLocalize();
  if (by === SOURCE_AI) {
    return (
      <SourceTag source={SOURCE_AI} label={localize('com_skills_builder_source_added')}>
        <button
          type="button"
          onClick={onRemove}
          title={localize('com_skills_builder_step_remove')}
          aria-label={localize('com_skills_builder_step_remove')}
          className="opacity-70 hover:opacity-100"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      </SourceTag>
    );
  }
  if (by === SOURCE_ME) {
    return <SourceTag source={SOURCE_ME} label={localize('com_skills_builder_source_wrote')} />;
  }
  return <SourceTag source={by} />;
}

export default function Preview({
  state,
  steps,
  onEdit,
  onStepOff,
  onStepsRestore,
  onToggleConnector,
}: Omit<PreviewProps, 'author'>) {
  const localize = useLocalize();
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const { values, sources } = state;
  const empty = state.text.trim().length === 0;
  const clickLabel = localize('com_skills_builder_click_to_edit');
  const done = () => setEditing(null);
  const showFields = FIELD_OUTPUTS.has(values.output);
  const connectors = [...new Set([...values.connectors, ...state.recommended])];

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-center text-xs text-text-secondary">
        {localize(empty ? 'com_skills_builder_note_empty' : 'com_skills_builder_note_filled')}
      </p>

      <Block
        title={
          <>
            {localize('com_skills_builder_when')}
            <SourceTag source={sources.triggers} />
          </>
        }
      >
        {editing === 'triggers' && (
          <ListInput
            label={localize('com_skills_builder_when')}
            values={values.triggers}
            placeholder={localize('com_skills_builder_when_placeholder')}
            onChange={(triggers) => onEdit('triggers', triggers)}
            onDone={done}
          />
        )}
        {editing !== 'triggers' && values.triggers.length > 0 && (
          <>
            <button
              type="button"
              title={clickLabel}
              onClick={() => setEditing('triggers')}
              className="mb-1 flex flex-wrap gap-1.5 rounded-lg p-0.5 hover:bg-surface-hover"
            >
              {values.triggers.map((trigger) => (
                <span
                  key={trigger}
                  className="rounded-full border border-border-brand bg-surface-brand-subtle px-2.5 py-0.5 text-xs text-text-primary"
                >
                  {trigger}
                </span>
              ))}
            </button>
            <p className="text-xs text-text-secondary">
              {localize('com_skills_builder_when_hint')}
            </p>
          </>
        )}
        {editing !== 'triggers' && values.triggers.length === 0 && (
          <EditButton label={clickLabel} onClick={() => setEditing('triggers')}>
            <Ghost>{localize('com_skills_builder_when_ghost')}</Ghost>
          </EditButton>
        )}
      </Block>

      <Block title={localize('com_skills_builder_how')}>
        {steps.length > 0 ? (
          <ol className="ms-5 list-decimal text-sm leading-7 text-text-primary">
            {steps.map((step) => (
              <li key={`${step.by}:${step.text}`}>
                {step.text} <StepTag by={step.by} onRemove={() => onStepOff(step.text)} />
              </li>
            ))}
          </ol>
        ) : (
          <Ghost>{localize('com_skills_builder_how_ghost')}</Ghost>
        )}
        {state.aiOff.length > 0 && (
          <p className="mt-1 text-xs text-text-secondary">
            {localize('com_skills_builder_steps_removed', { count: state.aiOff.length })}{' '}
            <button type="button" className="underline" onClick={onStepsRestore}>
              {localize('com_skills_builder_steps_restore')}
            </button>
          </p>
        )}
      </Block>

      <Block
        title={
          <>
            {localize('com_skills_builder_output')}
            <SourceTag source={sources.output} />
          </>
        }
      >
        {editing === 'output' ? (
          <div className="grid grid-cols-5 gap-2" role="group">
            {OUTPUTS.map((output) => (
              <button
                key={output}
                type="button"
                aria-pressed={values.output === output}
                onClick={() => {
                  onEdit('output', output);
                  done();
                }}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-center',
                  values.output === output
                    ? 'border-border-brand bg-surface-brand-subtle'
                    : 'border-border-light bg-surface-primary hover:border-border-medium',
                )}
              >
                <span className="text-xl" aria-hidden="true">
                  {OUTPUT_CARD[output].icon}
                </span>
                <b className="text-sm">{localize(OUTPUT_CARD[output].label)}</b>
                <small className="text-xs text-text-secondary">
                  {localize(OUTPUT_CARD[output].desc)}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm">
            <EditButton label={clickLabel} onClick={() => setEditing('output')}>
              <b>{localize(OUTPUT_CARD[values.output].label)}</b>
            </EditButton>
            {values.extras.length > 0 && (
              <span className="text-text-secondary">
                {' + '}
                {values.extras.map((extra) => localize(EXTRA_LABEL[extra])).join(', ')}
              </span>
            )}
          </div>
        )}
        {showFields &&
          (editing === 'fields' ? (
            <div className="mt-2">
              <ListInput
                label={localize('com_skills_builder_fields_placeholder')}
                values={values.fields}
                placeholder={localize('com_skills_builder_fields_placeholder')}
                onChange={(fields) => onEdit('fields', fields)}
                onDone={done}
              />
            </div>
          ) : (
            <button
              type="button"
              title={localize('com_skills_builder_fields_edit')}
              onClick={() => setEditing('fields')}
              className="mt-2 w-full overflow-hidden rounded-lg border border-dashed border-border-light hover:border-border-medium"
            >
              <table className="w-full text-xs">
                <thead className="bg-surface-tertiary">
                  <tr>
                    {(values.fields.length > 0 ? values.fields : ['…']).slice(0, 5).map((field) => (
                      <th key={field} className="px-2 py-1 text-start font-semibold">
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {(values.fields.length > 0 ? values.fields : ['…']).slice(0, 5).map((field) => (
                      <td key={field} className="px-2 py-1 text-text-tertiary">
                        …
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </button>
          ))}
        {showFields && <SourceTag source={sources.fields} />}
      </Block>

      <Block title={localize('com_skills_builder_data')}>
        <ul className="ms-5 list-disc text-sm text-text-primary">
          <li>
            {localize(
              values.output === 'draft'
                ? 'com_skills_builder_data_chat'
                : 'com_skills_builder_data_files',
            )}
          </li>
        </ul>
        {connectors.length > 0 && (
          <div className="mt-2 flex flex-col">
            {connectors.map((name) => {
              const on = values.connectors.includes(name);
              return (
                <label
                  key={name}
                  className="flex items-center gap-2 border border-b-0 border-border-light bg-surface-primary px-2.5 py-1.5 text-sm first:rounded-t-lg last:rounded-b-lg last:border-b"
                >
                  <span className="flex-1">{name}</span>
                  {!on && state.recommended.includes(name) && (
                    <span className="rounded-full border border-border-brand px-1.5 text-xs">
                      {localize('com_skills_builder_ai_recommended')}
                    </span>
                  )}
                  <input
                    type="checkbox"
                    role="switch"
                    aria-checked={on}
                    checked={on}
                    onChange={() => onToggleConnector(name)}
                  />
                </label>
              );
            })}
          </div>
        )}
        <p className="mt-1.5 text-xs text-text-secondary">
          {localize(
            values.connectors.length > 0
              ? 'com_skills_builder_connectors_on'
              : 'com_skills_builder_connectors_off',
          )}
        </p>
      </Block>
    </div>
  );
}
