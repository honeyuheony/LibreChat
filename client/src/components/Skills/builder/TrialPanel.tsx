import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

export type TrialFailure = 'no_agent' | 'save' | 'conflict' | 'run';

export type TrialView =
  | { status: 'idle' }
  | { status: 'running'; reply: string }
  | { status: 'passed'; reply: string }
  | { status: 'failed'; reason: TrialFailure };

const FAILURE_KEY: Record<TrialFailure, TranslationKeys> = {
  no_agent: 'com_skills_builder_test_no_agent',
  save: 'com_skills_builder_save_failed',
  conflict: 'com_skills_builder_save_conflict',
  run: 'com_skills_builder_test_failed',
};

type TrialPanelProps = {
  view: TrialView;
  tested: boolean;
  prompt: string;
  seconds?: number;
  manualMinutes: number;
};

/** 테스트 영역: 임시 대화 한 turn 의 진행·결과와 실행 시간, 회당 절감 분. */
export default function TrialPanel({
  view,
  tested,
  prompt,
  seconds,
  manualMinutes,
}: TrialPanelProps) {
  const localize = useLocalize();
  if (view.status === 'idle' || (view.status === 'passed' && !tested)) {
    return null;
  }
  const passed = view.status === 'passed';

  return (
    <section
      id="builder-trial"
      aria-live="polite"
      className="mt-4 border-t border-border-light pt-3.5"
    >
      <h3 className="mb-2 flex flex-wrap items-center gap-2 text-base font-semibold text-text-primary">
        {localize('com_skills_builder_test_heading')}
        {passed && (
          <span className="rounded-full border border-status-success-border px-2 text-xs text-status-success">
            {localize('com_skills_builder_test_passed')}
          </span>
        )}
        {view.status === 'running' && (
          <span className="rounded-full border border-border-medium px-2 text-xs text-text-secondary">
            {localize('com_skills_builder_test_running')}
          </span>
        )}
        {prompt && (
          <span className="text-xs font-normal text-text-secondary">
            {localize('com_skills_builder_test_prompt', { prompt })}
          </span>
        )}
      </h3>
      {view.status === 'failed' && (
        <p role="alert" className="text-sm text-status-error">
          {localize(FAILURE_KEY[view.reason])}
        </p>
      )}
      {passed && seconds != null && (
        <div className="mb-1.5 rounded-lg border border-border-light bg-surface-primary px-2.5 py-1.5 text-xs text-text-secondary">
          {localize('com_skills_builder_test_seconds', { seconds })}
          {manualMinutes > 0 && (
            <>
              {' · '}
              {localize('com_skills_builder_test_saving', {
                manual: manualMinutes,
                saved: Math.max(0, Math.round(manualMinutes - seconds / 60)),
              })}
            </>
          )}
        </div>
      )}
      {(view.status === 'running' || passed) && (
        <>
          <div className="mb-1.5 mt-2.5 text-xs text-text-secondary">
            {localize('com_skills_builder_test_reply')}
          </div>
          <div className="whitespace-pre-wrap rounded-lg border border-border-light bg-surface-primary px-2.5 py-1.5 text-sm text-text-primary">
            {view.reply || '…'}
          </div>
        </>
      )}
    </section>
  );
}
