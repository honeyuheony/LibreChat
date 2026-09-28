import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  Button,
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  useToastContext,
  OGDialogDescription,
} from '@librechat/client';
import type { BuilderSession } from './useSession';
import type { TranslationKeys } from '~/hooks';
import type { PreviewBlock } from './Blocks';
import type { PeerExample } from './peers';
import { getSkillTitle } from '~/components/Skills/Marketplace/skillCategories';
import { SOURCE_ME, DRAFT_SLUG, splitSentences } from './state';
import SourceTag, { ChangedMark } from './SourceTag';
import { pluginFiles } from './markdown';
import TrialPanel from './TrialPanel';
import { useLocalize } from '~/hooks';
import PreviewHead from './Head';
import AttachRow from './Attach';
import Preview from './Preview';
import Folder from './Folder';
import PeekRow from './Peek';
import { cn } from '~/utils';
import Share from './Share';
import Todo from './Todo';

type BuilderProps = {
  session: BuilderSession;
  author: string;
  department?: string;
  /** 사용자가 쓸 수 있는 MCP 서버 이름. 「읽는 자료」에서 펼쳐 켤 수 있다. */
  connectorChoices?: string[];
  fromChat?: boolean;
  /** 「다른 사람이 쓴 예 보기」 목록. 읽는 중이면 undefined 다. */
  peers?: PeerExample[];
  onPeek?: (open: boolean) => void;
  /** 응용 편집이면 원본 이름. */
  forkTitle?: string;
  onCancel: () => void;
  onPublish: () => void;
};

/**
 * 편집기 뒤 마켓이 비쳐 보이도록 옅게 흐린 막을 깐다. 투명도 줄이기 설정이면 흐림 없이 조금 더 짙게 깐다.
 * 공용 배경막(bg-black/80)에는 막 색 역할이 없어 여기서만 덮어쓴다.
 */
const OVERLAY_CLASS =
  'bg-black/[0.38] backdrop-blur-[6px] [@media(prefers-reduced-transparency:reduce)]:bg-black/[0.55] [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none';

/** 칸마다 70vh 까지만 늘고 넘치면 칸 안에서 굴린다. */
const COLUMN_CLASS = 'min-h-0 overflow-auto px-5 py-4 md:max-h-[70vh]';

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

function headerText(
  localize: ReturnType<typeof useLocalize>,
  fromChat: boolean | undefined,
  forkTitle: string | undefined,
): { title: string; subtitle: string } {
  if (forkTitle != null) {
    return {
      title: localize('com_skills_builder_fork_title', { name: forkTitle }),
      subtitle: localize('com_skills_builder_fork_subtitle'),
    };
  }
  if (fromChat) {
    return {
      title: localize('com_skills_chat_save_as_agent'),
      subtitle: localize('com_skills_builder_from_chat_subtitle'),
    };
  }
  return {
    title: localize('com_skills_new_agent'),
    subtitle: localize('com_skills_builder_subtitle'),
  };
}

/** agent 만들기 편집기(마켓 위 모달): 왼쪽 입력창 하나, 오른쪽 미리보기·폴더·테스트, 아래 할 일과 단추. */
export default function Builder({
  session,
  author,
  department,
  connectorChoices,
  fromChat,
  peers,
  onPeek,
  forkTitle,
  onCancel,
  onPublish,
}: BuilderProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { state } = session;
  const [selectedFile, setSelectedFile] = useState('');
  const [raw, setRaw] = useState(false);
  const [activeBlock, setActiveBlock] = useState<PreviewBlock | null>(null);
  const [askText, setAskText] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const files = pluginFiles(state, author);
  const skillPath = files.find((file) => file.path.endsWith('SKILL.md'))?.path ?? files[0].path;
  const selected = files.some((file) => file.path === selectedFile) ? selectedFile : skillPath;
  const empty = state.text.trim().length === 0;
  const running = session.trial.status === 'running';
  const { title, subtitle } = headerText(localize, fromChat, forkTitle);
  const textChanged = session.changed.has('text');
  const draftStatus = draftStatusKey(session.draft);
  const textSource = state.direct && !textChanged ? state.textBy : SOURCE_ME;
  const statusText = askText && empty ? 'com_skills_builder_test_needs_text' : draftStatus;
  /** 처음부터 누를 수 있다. 글이 없으면 저장이 실패하므로 요청 대신 글칸으로 안내한다. */
  const runTest = () => {
    if (empty) {
      setAskText(true);
      textRef.current?.focus();
      return;
    }
    void session.runTest();
  };
  const peek = (open: boolean) => {
    setActiveBlock('how');
    onPeek?.(open);
  };
  const copyPeer = ({ skill, text }: PeerExample) => {
    const name = getSkillTitle(skill);
    session.copyText(
      splitSentences(text).join('\n'),
      localize('com_skills_builder_source_copied', { name }),
    );
    setActiveBlock('how');
    showToast({
      status: 'success',
      message: localize('com_skills_builder_peek_copied', { name }),
    });
  };

  return (
    <OGDialog open onOpenChange={(open) => !open && onCancel()}>
      <OGDialogContent
        showCloseButton={false}
        overlayClassName={OVERLAY_CLASS}
        className="flex w-[1180px] max-w-[97vw] flex-col gap-0 overflow-hidden rounded-[22px] bg-presentation p-0"
      >
        <header className="flex items-center gap-3 border-b border-border-light px-5 py-3">
          <OGDialogTitle className="flex-none text-base font-bold text-text-primary">
            {title}
          </OGDialogTitle>
          <OGDialogDescription className="flex-1 text-sm text-text-secondary">
            {subtitle}
          </OGDialogDescription>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={localize('com_ui_close')}
            onClick={onCancel}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
          <div className={COLUMN_CLASS}>
            <section className="flex flex-col gap-1.5 rounded-[14px] border border-border-brand bg-surface-primary px-[14px] py-3 ring-[3px] ring-surface-brand-subtle">
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
                      label={
                        textSource === SOURCE_ME
                          ? localize('com_skills_builder_source_wrote')
                          : undefined
                      }
                    />
                  )}
                  <ChangedMark show={textChanged} />
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
                ref={textRef}
                rows={11}
                value={state.text}
                onChange={(event) => {
                  setAskText(false);
                  session.setText(event.target.value);
                }}
                onFocus={() => setActiveBlock('how')}
                placeholder={localize('com_skills_builder_text_placeholder')}
                className="w-full resize-y rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-[15.5px] leading-relaxed text-text-primary placeholder:text-text-muted focus:border-ring-primary focus:outline-none focus:ring-[3px] focus:ring-border-brand md:min-h-[297px]"
              />
              <p className="min-h-4 text-xs text-text-secondary" aria-live="polite">
                {statusText ? localize(statusText) : ''}
              </p>
              <AttachRow files={state.files} onPick={session.attach} onClear={session.clearFiles} />
              <PeekRow peers={peers} onPeek={peek} onCopy={copyPeer} />
            </section>
          </div>

          <div className={cn(COLUMN_CLASS, 'border-border-light bg-surface-secondary md:border-s')}>
            <PreviewHead
              state={state}
              author={author}
              department={department}
              onEdit={session.edit}
              changed={session.changed}
              active={activeBlock}
              onActivate={setActiveBlock}
            />
            <Folder
              root={state.slug || DRAFT_SLUG}
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
                    changed={session.changed}
                    active={activeBlock}
                    onActivate={setActiveBlock}
                    connectorChoices={connectorChoices}
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
          <Button variant="ghost" size="pill" onClick={onCancel} className="text-text-tertiary">
            {localize('com_ui_cancel')}
          </Button>
          <Button
            variant={session.tested ? 'outline' : 'submit'}
            size="sm"
            shape="round"
            className="h-[37px] w-[109px] px-0 text-[14.5px] font-normal"
            disabled={running}
            onClick={runTest}
          >
            {localize(testButtonKey(running, session.tested))}
          </Button>
          <Button
            variant="submit"
            size="sm"
            shape="round"
            className="h-[37px] w-[65px] px-0 text-[14.5px] font-normal"
            disabled={!session.ready || session.publishing}
            onClick={onPublish}
          >
            {localize(
              session.forkOf ? 'com_skills_builder_republish' : 'com_skills_builder_publish',
            )}
          </Button>
        </footer>
      </OGDialogContent>
    </OGDialog>
  );
}
