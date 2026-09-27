import { useContext, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Constants, QueryKeys, dataService } from 'librechat-data-provider';
import type { Agents } from 'librechat-data-provider';
import { TaskApprovalActions, TaskChip } from './TaskChip';
import { ChatContext } from '~/Providers/ChatContext';
import useDebounce from '~/hooks/Input/useDebounce';
import useTaskApproval from './useTaskApproval';
import { stringList } from './stages';
import { useLocalize } from '~/hooks';

type FieldChip = { name: string; on: boolean };

/** Chip clicks within this window share one estimate request. */
const ESTIMATE_DEBOUNCE_MS = 400;

function initialChips(args: Record<string, unknown>): FieldChip[] {
  const fields = stringList(args.fields);
  const suggested = stringList(args.suggested_fields).filter((name) => !fields.includes(name));
  return [
    ...fields.map((name) => ({ name, on: true })),
    ...suggested.map((name) => ({ name, on: false })),
  ];
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * The same card after the call ran: the fields it ran with stay on, the unused
 * suggestions off, nothing can be changed. `args` come from the saved tool call,
 * which the completion step rewrites with the arguments the tool actually got, so
 * fields the user edited on the card show here.
 */
export function TaskSchemaRan({
  args,
  cancelled = false,
}: {
  args: Record<string, unknown>;
  /** Cancelled at this card, so the fields shown were never run. */
  cancelled?: boolean;
}) {
  const localize = useLocalize();
  const chips = initialChips(args);
  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="task-schema-ran">
      <p className="text-[0.9375rem] text-text-primary">
        {localize('com_ui_task_schema_intro_nocount')}
      </p>
      <div className="rounded-xl border border-border-light bg-surface-primary px-3.5 py-3">
        <h4 className="mb-2 text-[0.8125rem] font-medium text-text-secondary">
          {localize('com_ui_task_schema_title')}
        </h4>
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <TaskChip key={chip.name} label={chip.name} on={chip.on} disabled />
          ))}
        </div>
        <p className="mt-2.5 text-sm text-text-secondary">
          {localize(cancelled ? 'com_ui_task_cancelled' : 'com_ui_task_ran')}
        </p>
      </div>
    </div>
  );
}

/** Field confirmation card for a paused `extract_table` call. */
export default function TaskSchemaApproval({
  approval,
  toolCallId,
  args,
}: {
  approval: NonNullable<Agents.ToolCall['approval']>;
  toolCallId: string;
  args: Record<string, unknown>;
}) {
  const localize = useLocalize();
  const conversationId = useContext(ChatContext)?.conversation?.conversationId ?? '';
  const {
    status,
    locked,
    decision,
    othersPending,
    canEdit,
    canReject,
    resolveRun,
    decide,
    reject,
  } = useTaskApproval(approval, toolCallId);
  const [chips, setChips] = useState<FieldChip[]>(() => initialChips(args));
  const [adding, setAdding] = useState(false);
  const [draftField, setDraftField] = useState('');
  const selected = useMemo(() => chips.filter((chip) => chip.on).map((chip) => chip.name), [chips]);
  /** The estimate follows the chips once they settle; the last one stays shown meanwhile. */
  const settledKey = useDebounce(JSON.stringify(selected), ESTIMATE_DEBOUNCE_MS);
  const estimateFields = useMemo(() => JSON.parse(settledKey) as string[], [settledKey]);

  const estimate = useQuery(
    [QueryKeys.taskEstimate, conversationId, estimateFields],
    () => dataService.getTaskEstimate(conversationId, estimateFields),
    {
      enabled:
        conversationId.length > 0 &&
        conversationId !== Constants.NEW_CONVO &&
        estimateFields.length > 0,
      keepPreviousData: true,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );
  const docs = estimate.data?.docs;

  const toggle = (index: number) =>
    setChips((current) =>
      current.map((chip, i) => (i === index ? { ...chip, on: !chip.on } : chip)),
    );

  const addField = () => {
    const name = draftField.trim();
    if (name.length > 0) {
      setChips((current) =>
        current.some((chip) => chip.name === name)
          ? current.map((chip) => (chip.name === name ? { ...chip, on: true } : chip))
          : [...current, { name, on: true }],
      );
    }
    setDraftField('');
    setAdding(false);
  };

  const changed = !sameList(selected, stringList(args.fields));
  const resolution = resolveRun({ ...args, fields: selected }, changed);

  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="task-schema-approval">
      <p className="text-[0.9375rem] text-text-primary">
        {docs != null
          ? localize('com_ui_task_schema_intro', { 0: docs })
          : localize('com_ui_task_schema_intro_nocount')}
      </p>
      <div className="rounded-xl border border-border-light bg-surface-primary px-3.5 py-3">
        <h4 className="mb-2 text-[0.8125rem] font-medium text-text-secondary">
          {localize('com_ui_task_schema_title')}
        </h4>
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip, index) => (
            <TaskChip
              key={chip.name}
              label={chip.name}
              on={chip.on}
              disabled={locked || !canEdit}
              onClick={() => toggle(index)}
            />
          ))}
          {!locked && canEdit && !adding && (
            <TaskChip
              label={localize('com_ui_task_add_field')}
              dashed
              onClick={() => setAdding(true)}
            />
          )}
          {adding && (
            <input
              // The field only appears after the user presses the add chip, so focus follows that press.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={draftField}
              onChange={(event) => setDraftField(event.target.value)}
              onBlur={addField}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  addField();
                } else if (event.key === 'Escape') {
                  setDraftField('');
                  setAdding(false);
                }
              }}
              placeholder={localize('com_ui_task_add_field_placeholder')}
              aria-label={localize('com_ui_task_add_field_placeholder')}
              className="w-40 rounded-lg border border-border-xheavy bg-surface-primary px-2.5 py-1 text-sm text-text-primary placeholder:text-text-secondary"
            />
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <TaskApprovalActions
            status={status}
            locked={locked}
            decision={decision}
            othersPending={othersPending}
            runDisabled={selected.length === 0 || resolution == null}
            onRun={() => resolution != null && decide(resolution)}
            onReject={canReject ? reject : undefined}
            blockedReason={
              changed && resolution == null ? localize('com_ui_task_edit_not_allowed') : undefined
            }
          >
            {estimate.data != null && (
              <span className="text-sm text-text-secondary">
                {estimate.data.minutes.min === estimate.data.minutes.max
                  ? localize('com_ui_task_estimate_single', { 0: estimate.data.minutes.min })
                  : localize('com_ui_task_estimate', {
                      0: estimate.data.minutes.min,
                      1: estimate.data.minutes.max,
                    })}
                {' · '}
                {localize(
                  estimate.data.cached > 0
                    ? 'com_ui_task_estimate_cached'
                    : 'com_ui_task_estimate_first',
                )}
              </span>
            )}
          </TaskApprovalActions>
        </div>
      </div>
    </div>
  );
}
