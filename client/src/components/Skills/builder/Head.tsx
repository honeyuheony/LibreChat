import type { BuilderField, BuilderState, BuilderValues, ChangedField } from './state';
import type { PreviewBlock } from './Blocks';
import {
  NO_CHANGES,
  EditButton,
  EMOJI_STYLE,
  InlineInput,
  useEditing,
  blockFrame,
  ignoreActivate,
  useRevealWhenActive,
  Ghost,
} from './Blocks';
import { DEFAULT_SKILL_ICON, SKILL_ICON_CHOICES } from '../Marketplace/SkillIcon';
import SourceTag, { ChangedMark } from './SourceTag';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export type HeadProps = {
  state: BuilderState;
  author: string;
  department?: string;
  onEdit: <K extends BuilderField>(field: K, value: BuilderValues[K]) => void;
  /** 응용 편집에서 원본과 달라진 칸. 새로 만들 때는 비어 있다. */
  changed?: ReadonlySet<ChangedField>;
  active?: PreviewBlock | null;
  onActivate?: (block: PreviewBlock) => void;
};

export default function PreviewHead({
  state,
  author,
  department,
  onEdit,
  changed = NO_CHANGES,
  active = null,
  onActivate = ignoreActivate,
}: HeadProps) {
  const localize = useLocalize();
  const [editing, setEditing] = useEditing(onActivate);
  const { values, sources } = state;
  const clickLabel = localize('com_skills_builder_click_to_edit');
  const done = () => setEditing(null);
  const highlighted = active === 'head';
  const ref = useRevealWhenActive(highlighted);

  return (
    <section
      ref={ref}
      data-active={highlighted}
      className={cn(blockFrame(highlighted), 'flex items-center gap-3.5 px-4 py-3')}
    >
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          title={localize('com_skills_builder_icon_change')}
          aria-label={localize('com_skills_builder_icon_change')}
          onClick={() => setEditing(editing === 'icon' ? null : 'icon')}
          className="flex size-[68px] items-center justify-center rounded-full bg-status-success-subtle text-[34px]"
        >
          <span aria-hidden="true" style={EMOJI_STYLE}>
            {values.icon || DEFAULT_SKILL_ICON}
          </span>
        </button>
      </div>
      <div className="min-w-0 flex-1">
        {editing === 'icon' && (
          <div className="mb-2 flex flex-wrap gap-1.5" role="group">
            {SKILL_ICON_CHOICES.map((icon) => (
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
            <h3 className="text-[19px] font-bold text-text-primary">
              <EditButton label={clickLabel} onClick={() => setEditing('title')}>
                {values.title || <Ghost>{localize('com_skills_builder_name_ghost')}</Ghost>}
              </EditButton>
            </h3>
          )}
          <SourceTag source={sources.title} />
          <ChangedMark show={changed.has('title') || changed.has('icon')} />
        </div>
        <div className="text-xs text-text-secondary">
          {department
            ? localize('com_skills_builder_by_dept', { name: author, dept: department })
            : localize('com_skills_builder_by', { name: author })}
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
          <ChangedMark show={changed.has('description')} />
        </div>
      </div>
    </section>
  );
}
