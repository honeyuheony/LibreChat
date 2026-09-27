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

/** 이 시간 안에 칩을 여러 번 눌러도 예상치 요청은 한 번만 보낸다. */
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

/** 완료된 tool call의 args에는 승인 후 카드에서 고른 필드가 저장된다. */
export function TaskSchemaRan({
  args,
  cancelled = false,
}: {
  args: Record<string, unknown>;
  /** 이 카드에서 취소했으므로 표시한 필드는 실행하지 않았다. */
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
  /** 칩을 바꾼 뒤 새 예상치를 받을 때까지 이전 예상치를 표시한다. */
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
              // 추가 칩을 눌러 입력 칸이 생기면 바로 입력하도록 초점을 옮긴다.
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
