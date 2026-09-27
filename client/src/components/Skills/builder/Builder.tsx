import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@librechat/client';
import type { BuilderSession } from './useSession';
import type { TranslationKeys } from '~/hooks';
import Preview, { PreviewHead } from './Preview';
import { pluginFiles } from './state';
import TrialPanel from './TrialPanel';
import { useLocalize } from '~/hooks';
import SourceTag from './SourceTag';
import Folder from './Folder';
import Share from './Share';
import Todo from './Todo';

type BuilderProps = {
  session: BuilderSession;
  author: string;
  fromChat?: boolean;
  onCancel: () => void;
  onPublish: () => void;
};

function draftStatusKey(draft: BuilderSession['draft']): TranslationKeys | null {
  if (draft.pending) {
    return 'com_skills_builder_draft_pending';
  }
  return draft.failed ? 'com_skills_builder_draft_failed' : null;
}

function testButtonKey(running: boolean, tested: boolean): TranslationKeys {
  if (running) {
    return 'com_skills_builder_testing';
  }
  return tested ? 'com_skills_builder_test_again' : 'com_skills_builder_test_run';
}

/** agent 만들기 편집기: 왼쪽 입력창 하나, 오른쪽 미리보기·폴더·테스트, 아래 할 일과 단추. */
export default function Builder({ session, author, fromChat, onCancel, onPublish }: BuilderProps) {
  const localize = useLocalize();
  const { state } = session;
  const [selectedFile, setSelectedFile] = useState('');
  const [raw, setRaw] = useState(false);
  const files = pluginFiles(state, author);
  const skillPath = files.find((file) => file.path.endsWith('SKILL.md'))?.path ?? files[0].path;
  const selected = files.some((file) => file.path === selectedFile) ? selectedFile : skillPath;
  const empty = state.text.trim().length === 0;
  const running = session.trial.status === 'running';
  const title = localize(fromChat ? 'com_skills_chat_save_as_agent' : 'com_skills_new_agent');
  const draftStatus = draftStatusKey(session.draft);
  const textSource = state.direct ? state.textBy : 'me';

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-presentation">
      <header className="flex items-center gap-3 border-b border-border-light px-5 py-3">
        <h1 className="flex-none text-base font-semibold text-text-primary">{title}</h1>
        <span className="flex-1 text-sm text-text-secondary">
          {localize(
            fromChat ? 'com_skills_builder_from_chat_subtitle' : 'com_skills_builder_subtitle',
          )}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={localize('com_ui_close')}
          onClick={onCancel}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-h-0 overflow-auto px-5 py-4">
          <section className="flex flex-col gap-2 rounded-xl border border-border-light bg-surface-primary px-4 py-3.5">
            <div className="flex items-center gap-2">
              <label htmlFor="builder-text" className="text-[15.5px] font-bold text-text-primary">
                {localize(
                  state.direct ? 'com_skills_builder_how' : 'com_skills_builder_text_heading',
                )}
              </label>
              <span className="ms-auto">
                {!empty && (
                  <SourceTag
                    source={textSource}
                    label={state.direct ? undefined : localize('com_skills_builder_source_wrote')}
                  />
                )}
              </span>
            </div>
            <p className="text-sm text-text-secondary">
              {localize(
                state.direct
                  ? 'com_skills_builder_text_hint_direct'
                  : 'com_skills_builder_text_hint',
              )}
            </p>
            <textarea
              id="builder-text"
              rows={11}
              value={state.text}
              onChange={(event) => session.setText(event.target.value)}
              placeholder={localize('com_skills_builder_text_placeholder')}
              className="w-full resize-y rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-[15px] leading-relaxed text-text-primary placeholder:text-text-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            />
            <p className="min-h-4 text-xs text-text-secondary" aria-live="polite">
              {draftStatus ? localize(draftStatus) : ''}
            </p>
          </section>
        </div>

        <div className="min-h-0 overflow-auto border-border-light bg-surface-secondary px-5 py-4 md:border-s">
          <PreviewHead state={state} author={author} onEdit={session.edit} />
          <Folder
            root={state.slug || 'new-agent'}
            files={files}
            selected={selected}
            onSelect={setSelectedFile}
            raw={raw}
            onRaw={setRaw}
            empty={empty}
            readable={
              <div className="flex flex-col gap-2.5">
                <Preview
                  state={state}
                  steps={session.steps}
                  onEdit={session.edit}
                  onStepOff={session.stepOff}
                  onStepsRestore={session.stepsRestore}
                  onToggleConnector={session.connector}
                />
                <Share
                  manualMinutes={state.manualMinutes}
                  scope={state.scope}
                  onMinutes={session.setMinutes}
                  onScope={session.setScope}
                />
              </div>
            }
          />
          <TrialPanel
            view={session.trial}
            tested={session.tested}
            prompt={session.prompt}
            seconds={session.skill?.lastTest?.seconds}
            manualMinutes={state.manualMinutes}
          />
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border-light bg-surface-secondary px-5 py-3">
        <Todo items={session.todos} />
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {localize('com_ui_cancel')}
        </Button>
        <Button
          variant={session.tested ? 'outline' : 'submit'}
          size="sm"
          disabled={running || empty}
          onClick={() => void session.runTest()}
        >
          {localize(testButtonKey(running, session.tested))}
        </Button>
        <Button
          variant="submit"
          size="sm"
          disabled={!session.ready || session.publishing}
          onClick={onPublish}
        >
          {localize('com_skills_builder_publish')}
        </Button>
      </footer>
    </div>
  );
}
