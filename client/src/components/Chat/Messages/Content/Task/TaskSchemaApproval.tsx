import { useContext, useMemo, useState } from 'react';
import { Button } from '@librechat/client';
import { useQuery } from '@tanstack/react-query';
import { Constants } from 'librechat-data-provider';
import type { Agents } from 'librechat-data-provider';
import { TaskApprovalStatus, TaskChip } from './TaskChip';
import { ChatContext } from '~/Providers/ChatContext';
import useTaskApproval from './useTaskApproval';
import { fetchTaskEstimate } from './api';
import { stringList } from './stages';
import { useLocalize } from '~/hooks';

type FieldChip = { name: string; on: boolean };

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
  const { status, locked, submit } = useTaskApproval(approval.actionId, toolCallId);
  const [chips, setChips] = useState<FieldChip[]>(() => initialChips(args));
  const [adding, setAdding] = useState(false);
  const [draftField, setDraftField] = useState('');
  const canEdit = approval.allowed_decisions.includes('edit');
  const selected = useMemo(() => chips.filter((chip) => chip.on).map((chip) => chip.name), [chips]);

  const estimate = useQuery(
    ['taskEstimate', conversationId, selected],
    () => fetchTaskEstimate(conversationId, selected),
    {
      enabled:
        conversationId.length > 0 && conversationId !== Constants.NEW_CONVO && selected.length > 0,
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

  const run = () => {
    const unchanged = sameList(selected, stringList(args.fields));
    submit(unchanged ? null : { ...args, fields: selected });
  };

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
          {status === 'submitted' ? (
            <span className="text-sm text-text-secondary">{localize('com_ui_task_ran')}</span>
          ) : (
            <>
              <Button
                size="sm"
                variant="submit"
                disabled={locked || selected.length === 0}
                onClick={run}
              >
                {localize('com_ui_task_run')}
              </Button>
              {estimate.data != null && (
                <span className="text-sm text-text-secondary">
                  {localize('com_ui_task_estimate', {
                    0: estimate.data.minMinutes,
                    1: estimate.data.maxMinutes,
                  })}
                  {' · '}
                  {localize(
                    estimate.data.cached > 0
                      ? 'com_ui_task_estimate_cached'
                      : 'com_ui_task_estimate_first',
                  )}
                </span>
              )}
              <TaskApprovalStatus status={status} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
