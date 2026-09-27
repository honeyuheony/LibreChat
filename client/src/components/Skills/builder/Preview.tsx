import { X } from 'lucide-react';
import type { TSkillDraftExtra, TSkillDraftOutput } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import type { BuilderStep } from './state';
import type { HeadProps } from './Head';
import {
  Block,
  Ghost,
  ListInput,
  NO_CHANGES,
  NO_CHOICES,
  EditButton,
  useEditing,
  ignoreActivate,
} from './Blocks';
import { FIELD_OUTPUTS, OUTPUTS, SOURCE_AI, SOURCE_ME } from './state';
import SourceTag, { ChangedMark } from './SourceTag';
import ConnectorsBlock from './Connectors';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type PreviewProps = Pick<HeadProps, 'state' | 'onEdit' | 'changed' | 'active' | 'onActivate'> & {
  steps: BuilderStep[];
  onStepOff: (step: string) => void;
  onStepsRestore: () => void;
  onToggleConnector: (name: string) => void;
  /** 「내부 시스템도 봐야 하면」을 눌렀을 때 펼치는, 쓸 수 있는 MCP 서버 이름 전체. */
  connectorChoices?: string[];
};

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

/** 출처 배지를 마지막 단어와 묶어 문장 끝과 같은 줄에 둔다. 배지만 다음 줄로 떨어지지 않는다. */
function StepLine({ step, onRemove }: { step: BuilderStep; onRemove: (step: string) => void }) {
  const cut = step.text.lastIndexOf(' ') + 1;
  return (
    <li>
      {step.text.slice(0, cut)}
      <span data-step-tail className="whitespace-nowrap">
        {step.text.slice(cut)}
        <StepTag by={step.by} onRemove={() => onRemove(step.text)} />
      </span>
    </li>
  );
}

export default function Preview({
  state,
  steps,
  onEdit,
  onStepOff,
  onStepsRestore,
  onToggleConnector,
  changed = NO_CHANGES,
  active = null,
  onActivate = ignoreActivate,
  connectorChoices = NO_CHOICES,
}: PreviewProps) {
  const localize = useLocalize();
  const [editing, setEditing] = useEditing(onActivate);
  const { values, sources } = state;
  const empty = state.text.trim().length === 0;
  const clickLabel = localize('com_skills_builder_click_to_edit');
  const done = () => setEditing(null);
  const showFields = FIELD_OUTPUTS.has(values.output);
  const displayFields =
    showFields && values.fields.length === 0
      ? [localize('com_skills_builder_fields_label')]
      : values.fields;

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-center text-xs text-text-secondary">
        {localize(empty ? 'com_skills_builder_note_empty' : 'com_skills_builder_note_filled')}
      </p>

      <Block
        active={active === 'when'}
        title={
          <>
            {localize('com_skills_builder_when')}
            <SourceTag source={sources.triggers} />
            <ChangedMark show={changed.has('triggers')} />
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
            <Ghost className="text-[15.5px]">{localize('com_skills_builder_when_ghost')}</Ghost>
          </EditButton>
        )}
      </Block>

      <Block
        active={active === 'how'}
        title={
          <>
            {localize('com_skills_builder_how')}
            <ChangedMark show={changed.has('text')} />
          </>
        }
      >
        {steps.length > 0 ? (
          <ol className="ms-5 list-decimal text-sm leading-7 text-text-primary">
            {steps.map((step) => (
              <StepLine key={`${step.by}:${step.text}`} step={step} onRemove={onStepOff} />
            ))}
          </ol>
        ) : (
          <Ghost className="text-[15.5px]">{localize('com_skills_builder_how_ghost')}</Ghost>
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
        active={active === 'out'}
        title={
          <>
            {localize('com_skills_builder_output')}
            <SourceTag source={empty ? SOURCE_AI : sources.output} />
            <ChangedMark
              show={changed.has('output') || changed.has('extras') || changed.has('fields')}
            />
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
              <b className="text-[15.5px]">{localize(OUTPUT_CARD[values.output].label)}</b>
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
              className="mt-2 w-full overflow-hidden rounded-lg border border-border-light hover:border-border-medium"
            >
              <table className="w-full">
                <thead className="bg-surface-primary">
                  <tr>
                    {displayFields.slice(0, 5).map((field) => (
                      <th
                        key={field}
                        className="h-[30px] px-2 py-1 text-start text-[11.5px] font-medium text-text-muted"
                      >
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-[37px]">
                    {displayFields.slice(0, 5).map((field) => (
                      <td
                        key={field}
                        className="px-2 py-1 text-start text-[13px] text-text-tertiary"
                      >
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

      <ConnectorsBlock
        state={state}
        changed={changed}
        active={active === 'data'}
        onActivate={onActivate}
        onToggleConnector={onToggleConnector}
        connectorChoices={connectorChoices}
      />
    </div>
  );
}
