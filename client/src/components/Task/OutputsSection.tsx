import type { TaskOutput } from './taskState';
import { useTaskResultQuery } from '~/data-provider/Tasks/queries';
import { countTaskFootnotes, formatTaskTime } from './taskState';
import { shortResultTitle } from '~/utils/results';
import { useLocalize } from '~/hooks';
import { Section } from './Section';
import { cn } from '~/utils';

/** `doc`·`hwp` 는 파일 종류 표시라 그대로 쓰고, 표만 번역할 단어다. */
const OUTPUT_ICON: Record<TaskOutput['kind'], { label?: string; className: string }> = {
  table: { className: 'bg-surface-brand-subtle text-accent-primary' },
  summary: { label: 'doc', className: 'bg-status-success-subtle text-status-success' },
  report: { label: 'hwp', className: 'bg-status-warning-subtle text-status-warning-strong' },
};

/**
 * 결과물 행의 둘째 줄. 문서의 근거는 각주이고 각주는 저장된 결과에만 있으므로(`stats.reflected` 는
 * 문서 수다) 결과를 읽은 뒤에 수를 보인다. 결과 화면·메시지 카드와 같은 요청을 쓴다.
 */
function OutputMeta({ output }: { output: TaskOutput }) {
  const localize = useLocalize();
  const { data: result } = useTaskResultQuery(output.kind === 'table' ? null : output.resultId);
  let meta: string;
  if (output.kind === 'table') {
    meta = localize('com_ui_task_output_table_meta', {
      rows: output.stats?.docs ?? 0,
      none: output.stats?.none ?? 0,
    });
  } else if (result != null && result.kind !== 'table') {
    meta = localize('com_ui_task_output_doc_meta', { count: countTaskFootnotes(result) });
  } else {
    meta = localize('com_ui_task_output_doc');
  }
  const time = formatTaskTime(output.createdAt);
  return <span className="text-xs text-text-muted">{time ? `${meta} · ${time}` : meta}</span>;
}

export default function OutputsSection({
  outputs,
  open,
  onToggle,
  onOpen,
}: {
  outputs: TaskOutput[];
  open: boolean;
  onToggle: () => void;
  onOpen: (resultId: string) => void;
}) {
  const localize = useLocalize();
  return (
    <Section
      title={localize('com_ui_task_outputs')}
      count={outputs.length}
      open={open}
      onToggle={onToggle}
    >
      {outputs.length === 0 ? (
        <p className="text-[12.5px] text-text-muted">{localize('com_ui_task_outputs_empty')}</p>
      ) : (
        <ul>
          {outputs.map((output) => {
            const icon = OUTPUT_ICON[output.kind];
            return (
              <li key={output.resultId}>
                <button
                  type="button"
                  onClick={() => onOpen(output.resultId)}
                  data-testid="task-output-row"
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13.5px] hover:bg-surface-hover"
                >
                  <span
                    className={cn(
                      'inline-flex size-[30px] shrink-0 items-center justify-center rounded-md font-mono text-[11px]',
                      icon.className,
                    )}
                  >
                    {icon.label ?? localize('com_ui_task_icon_table')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate font-semibold text-text-primary">
                      {shortResultTitle(
                        {
                          kind: output.kind,
                          title: output.title,
                          rows: output.stats?.docs,
                        },
                        (rows) => localize('com_ui_task_count', { 0: String(rows) }),
                      )}
                    </b>
                    <OutputMeta output={output} />
                  </span>
                  <span className="text-xs text-text-muted">{localize('com_ui_task_open')} ›</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
