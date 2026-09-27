import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  Button,
  Spinner,
  OGDialog,
  OGDialogTitle,
  OGDialogContent,
  useToastContext,
  OGDialogDescription,
} from '@librechat/client';
import type { BuilderSession } from './useSession';
import type { TranslationKeys } from '~/hooks';
import type { PreviewBlock } from './Preview';
import type { BuilderFile } from './state';
import type { PeerExample } from './peers';
import {
  runsOf,
  formatCount,
  getSkillTitle,
} from '~/components/Skills/Marketplace/skillCategories';
import { SOURCE_ME, DRAFT_SLUG, pluginFiles, splitSentences } from './state';
import SkillIcon from '~/components/Skills/Marketplace/SkillIcon';
import Preview, { EMOJI_STYLE, PreviewHead } from './Preview';
import SourceTag, { ChangedMark } from './SourceTag';
import TrialPanel from './TrialPanel';
import { useLocalize } from '~/hooks';
import Folder from './Folder';
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
 * 와이어프레임 v29 `.ov`(946·986행): 옅은 막 rgba(23,21,43,.42)과 blur(6px), 투명도 줄이기 설정이면 흐림 없이 .6.
 * 공용 배경막(bg-black/80)에 막 색 역할이 없어 여기서만 덮어쓴다. 보랏빛 먹색 역할이 없어 검정으로 쓰고,
 * 흰 바탕 위 밝기가 와이어프레임과 같도록 농도를 .38·.55 로 낮췄다.
 */
const OVERLAY_CLASS =
  'bg-black/[0.38] backdrop-blur-[6px] [@media(prefers-reduced-transparency:reduce)]:bg-black/[0.55] [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none';

/** 와이어프레임 `.md .na>div`(647행): 칸마다 70vh 까지만 늘고 넘치면 칸 안에서 굴린다. */
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

/** 대화에서 가져온 문서 이름과 종류. 번역 파일에 아직 없는 키라 형을 맞춘다. */
function FileChips({ files }: { files: BuilderFile[] }) {
  const localize = useLocalize();
  if (files.length === 0) {
    return null;
  }
  return (
    <ul
      aria-label={localize('com_skills_builder_files_list' as TranslationKeys)}
      className="contents"
    >
      {files.map((file) => (
        <li
          key={file.name}
          className="inline-flex items-center gap-1 rounded-full border border-border-light bg-surface-secondary px-2 py-0.5 text-xs text-text-primary"
        >
          {file.name}
          <span className="font-bold text-text-secondary">
            {localize(`com_skills_builder_file_kind_${file.kind}` as TranslationKeys)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 양식·예시 문서 붙이기 줄. 첫 단계는 예시 없이 시험하므로 붙인 파일은 쓰지 않고 그렇다고 알린다. */
function AttachRow({ files, onClear }: { files: BuilderFile[]; onClear: () => void }) {
  const localize = useLocalize();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState(false);
  const attached = picked || files.length > 0;
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border-[1.5px] border-solid border-border-medium bg-surface-primary px-2.5 py-2">
        <Button
          variant="outline"
          size="sm"
          className="h-auto gap-1 rounded-full border-border-medium px-[11px] py-[3px] text-[13px]"
          onClick={() => input.current?.click()}
        >
          <span aria-hidden="true" style={EMOJI_STYLE}>
            📎
          </span>
          {localize('com_skills_builder_files_attach')}
        </Button>
        {files.length > 0 ? (
          <>
            <FileChips files={files} />
            <button
              type="button"
              onClick={() => {
                setPicked(false);
                onClear();
              }}
              className="rounded-full border border-border-medium px-2.5 py-0.5 text-xs text-text-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            >
              {localize('com_ui_clear_all')}
            </button>
          </>
        ) : (
          <span className="text-xs text-text-secondary">
            {localize('com_skills_builder_files_hint')}
          </span>
        )}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          data-testid="builder-files"
          onChange={(event) => {
            setPicked((event.target.files?.length ?? 0) > 0);
            event.target.value = '';
          }}
        />
      </div>
      <p role="status" className="text-xs text-text-secondary empty:hidden">
        {attached ? localize('com_skills_builder_files_later') : ''}
      </p>
    </>
  );
}

type PeekRowProps = {
  /** 읽는 중이면 undefined 다. */
  peers?: PeerExample[];
  onPeek?: (open: boolean) => void;
  onCopy: (peer: PeerExample) => void;
};

/** 와이어프레임 `pk1 .by`: 작성자 · 부서 · 실행 수. 「By」와 응용 수는 적지 않는다. */
function peerByLine(skill: PeerExample['skill'], localize: ReturnType<typeof useLocalize>) {
  return [
    skill.authorName,
    skill.authorDepartment,
    localize('com_skills_meta_runs', { value: formatCount(runsOf(skill)) }),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** 「다른 사람이 쓴 예 보기」: 남의 agent 세 개와 그 글을 펼치고, 「이 글 가져오기」로 글칸에 넣는다. */
function PeekRow({ peers, onPeek, onCopy }: PeekRowProps) {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const toggle = (next: boolean) => {
    setOpen(next);
    onPeek?.(next);
  };
  return (
    <>
      <div>
        <Button
          variant="ghost"
          size="pill"
          aria-expanded={open}
          onClick={() => toggle(!open)}
          className="text-text-tertiary"
        >
          {localize(open ? 'com_skills_builder_peek_close' : 'com_skills_builder_peek')}
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-border-light bg-surface-secondary p-2.5">
          {peers == null && (
            <Spinner
              className="mx-auto text-text-secondary"
              aria-label={localize('com_ui_loading')}
            />
          )}
          {peers?.length === 0 && (
            <p className="text-sm text-text-secondary">
              {localize('com_skills_builder_peek_empty' as TranslationKeys)}
            </p>
          )}
          {peers != null && peers.length > 0 && (
            <ul aria-label={localize('com_skills_builder_peek')} className="flex flex-col gap-2.5">
              {peers.map((peer) => (
                <li
                  key={peer.skill._id}
                  className="rounded-lg border border-border-light bg-surface-primary p-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <SkillIcon skill={peer.skill} />
                    <div className="min-w-0 flex-1">
                      <b className="text-text-primary">{getSkillTitle(peer.skill)}</b>
                      <div className="text-xs text-text-secondary">
                        {peerByLine(peer.skill, localize)}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="pill"
                      className="border-border-medium text-text-secondary"
                      onClick={() => {
                        toggle(false);
                        onCopy(peer);
                      }}
                    >
                      {localize('com_skills_builder_peek_copy' as TranslationKeys)}
                    </Button>
                  </div>
                  <ol className="mt-2 list-decimal ps-5 font-sans text-[13px] leading-relaxed text-text-secondary">
                    {peer.text.split('\n').map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
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
  const statusText =
    askText && empty ? ('com_skills_builder_test_needs_text' as TranslationKeys) : draftStatus;
  /** 와이어프레임처럼 처음부터 누를 수 있다. 글이 없으면 저장이 실패하므로 요청 대신 글칸으로 안내한다. */
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
      localize('com_skills_builder_source_copied' as TranslationKeys, { name }),
    );
    setActiveBlock('how');
    showToast({
      status: 'success',
      message: localize('com_skills_builder_peek_copied' as TranslationKeys, { name }),
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
            <section className="flex flex-col gap-2 rounded-xl border border-border-brand bg-surface-primary px-4 py-3.5 ring-[3px] ring-surface-brand-subtle">
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
                className="w-full resize-y rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-[15px] leading-relaxed text-text-primary placeholder:text-text-tertiary focus:border-ring-primary focus:outline-none focus:ring-[3px] focus:ring-border-brand"
              />
              <p className="min-h-4 text-xs text-text-secondary" aria-live="polite">
                {statusText ? localize(statusText) : ''}
              </p>
              <AttachRow files={state.files} onClear={session.clearFiles} />
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
          <Button variant="ghost" size="sm" shape="round" onClick={onCancel}>
            {localize('com_ui_cancel')}
          </Button>
          <Button
            variant={session.tested ? 'outline' : 'submit'}
            size="sm"
            shape="round"
            disabled={running}
            onClick={runTest}
          >
            {localize(testButtonKey(running, session.tested))}
          </Button>
          <Button
            variant="submit"
            size="sm"
            shape="round"
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
