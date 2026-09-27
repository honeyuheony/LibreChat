import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  TSkill,
  TModelSpec,
  TSkillDraft,
  TCreateSkill,
  TSkillDraftRequest,
  TSkillPublishScope,
  TUpdateSkillVariables,
  TSkillPublishVariables,
  TSkillTestResultVariables,
} from 'librechat-data-provider';
import type { BuilderField, BuilderState, BuilderValues, ChangedField } from './state';
import type { TrialFailure, TrialView } from './TrialPanel';
import type { TrialTransport } from './trial';
import {
  isTested,
  editField,
  applyDraft,
  todoItems,
  composeSteps,
  SOURCE_ME,
  toSavePayload,
  starterPrompt,
  firstSentence,
  changedFields,
  isPublishReady,
  SOURCE_ORIGIN,
  contentSignature,
  toggleConnector,
  createBuilderState,
} from './state';
import { getResponseStatus } from '~/utils/errors';
import { runTrial } from './trial';
import useDraft from './useDraft';

/** test-result 가 응답 저장보다 먼저 닿을 때 한 번 다시 시도하기까지의 간격. 서버 저장 지연을 측정해 정한 값은 아니다. */
const TEST_RESULT_RETRY_MS = 1000;

export type SessionDeps = {
  requestDraft: (payload: TSkillDraftRequest) => Promise<TSkillDraft>;
  isRateLimited: (error: unknown) => boolean;
  createSkill: (payload: TCreateSkill) => Promise<TSkill>;
  /** 응용 편집일 때 처음 저장에서 원본 사본을 만든다. */
  forkSkill?: (variables: { id: string }) => Promise<TSkill>;
  updateSkill: (variables: TUpdateSkillVariables) => Promise<TSkill>;
  recordTest: (variables: TSkillTestResultVariables) => Promise<TSkill>;
  publish: (variables: TSkillPublishVariables) => Promise<TSkill>;
  transport: TrialTransport;
  spec: TModelSpec | null;
  conversationId?: string;
  wait?: (ms: number) => Promise<void>;
};

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

class SaveError extends Error {
  constructor(readonly reason: TrialFailure) {
    super(`Saving the skill failed: ${reason}`);
  }
}

function withSlug(state: BuilderState): BuilderState {
  return state.slug ? state : { ...state, slug: `agent-${Date.now().toString(36)}` };
}

/** 응용할 원본 id 와 원본으로 채운 첫 상태. 첫 상태는 「원본에서 변경」 비교 기준이 된다. */
export type ForkOrigin = { id: string; state: BuilderState };
/** `chat` 은 대화에서 정한 칸을 채운 첫 상태다(「이 작업을 agent로 저장」). */
type SessionInit = { text?: string; fork?: ForkOrigin; chat?: BuilderState };

const NO_CHANGES: ReadonlySet<ChangedField> = new Set();

export default function useSession(deps: SessionDeps, init: SessionInit = {}) {
  const [fork] = useState(init.fork);
  const [state, setState] = useState<BuilderState>(
    () => fork?.state ?? init.chat ?? createBuilderState(init.text ?? ''),
  );
  const [skill, setSkill] = useState<TSkill | undefined>();
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [trial, setTrial] = useState<TrialView>({ status: 'idle' });
  const [publishing, setPublishing] = useState(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const requestDraft = useCallback(
    (payload: TSkillDraftRequest) =>
      depsRef.current.requestDraft(
        depsRef.current.conversationId
          ? { ...payload, context: { conversationId: depsRef.current.conversationId } }
          : payload,
      ),
    [],
  );
  const onDraft = useCallback(
    (draft: TSkillDraft) => setState((prev) => applyDraft(prev, draft)),
    [],
  );
  const draft = useDraft({
    text: state.text,
    direct: state.direct,
    requestDraft,
    onDraft,
    isRateLimited: deps.isRateLimited,
  });

  const signature = useMemo(() => contentSignature(state), [state]);
  const dirty = savedSignature !== signature;
  const tested = isTested(skill, dirty);
  const changed = useMemo(
    () => (fork ? changedFields(state, fork.state) : NO_CHANGES),
    [fork, state],
  );
  const steps = useMemo(() => {
    const composed = composeSteps(state);
    if (!fork) {
      return composed;
    }
    const originalSteps = new Set(composeSteps(fork.state).map((step) => step.text));
    return composed.map((step) =>
      step.by === SOURCE_ORIGIN && !originalSteps.has(step.text)
        ? { ...step, by: SOURCE_ME }
        : step,
    );
  }, [fork, state]);
  const todos = todoItems(state, tested);
  const ready = isPublishReady(state, tested);
  const prompt = starterPrompt(state.values) || firstSentence(state.text);

  const setText = useCallback((text: string) => setState((prev) => ({ ...prev, text })), []);
  /** 남의 글을 가져오면 직접 모드로 바꾸고 출처를 `by` 로 둔다. */
  const copyText = useCallback(
    (text: string, by: string) => setState((prev) => ({ ...prev, text, direct: true, textBy: by })),
    [],
  );
  const edit = useCallback(
    <K extends BuilderField>(field: K, value: BuilderValues[K]) =>
      setState((prev) => editField(prev, field, value)),
    [],
  );
  /** 붙인 문서를 한꺼번에 뗀다. 문서는 저장하지 않으므로 테스트 결과는 그대로 둔다. */
  const clearFiles = useCallback(() => setState((prev) => ({ ...prev, files: [] })), []);
  const stepOff = useCallback(
    (step: string) => setState((prev) => ({ ...prev, aiOff: [...prev.aiOff, step] })),
    [],
  );
  const stepsRestore = useCallback(() => setState((prev) => ({ ...prev, aiOff: [] })), []);
  const connector = useCallback(
    (name: string) => setState((prev) => toggleConnector(prev, name)),
    [],
  );
  const setMinutes = useCallback(
    (manualMinutes: number) => setState((prev) => ({ ...prev, manualMinutes })),
    [],
  );
  const setScope = useCallback(
    (scope: TSkillPublishScope) => setState((prev) => ({ ...prev, scope })),
    [],
  );

  /** 원본 사본을 만든다. 사본 위 저장이 실패해도 다시 만들지 않도록 곧바로 붙잡아 둔다. */
  const forkOnce = async (origin: ForkOrigin): Promise<TSkill> => {
    if (!depsRef.current.forkSkill) {
      throw new SaveError('save');
    }
    try {
      const copy = await depsRef.current.forkSkill({ id: origin.id });
      setSkill(copy);
      return copy;
    } catch {
      throw new SaveError('save');
    }
  };

  /** 저장한 스킬과, 저장에 맞춰 이름(slug)이 바뀌었을 수 있는 편집기 상태를 돌려준다. */
  const save = async (current: BuilderState): Promise<{ saved: TSkill; state: BuilderState }> => {
    if (skill && savedSignature === contentSignature(current)) {
      return { saved: skill, state: current };
    }
    const target = !skill && fork ? await forkOnce(fork) : skill;
    const next =
      fork && target && current.slug !== target.name ? { ...current, slug: target.name } : current;
    const payload = toSavePayload(next);
    try {
      let saved: TSkill;
      if (!target) {
        const { manualMinutes, ...createPayload } = payload;
        saved = await depsRef.current.createSkill(createPayload);
        if (manualMinutes) {
          saved = await depsRef.current.updateSkill({
            id: saved._id,
            expectedVersion: saved.version,
            payload: { manualMinutes },
          });
        }
      } else {
        const { name: _name, ...updatePayload } = payload;
        saved = await depsRef.current.updateSkill({
          id: target._id,
          expectedVersion: target.version,
          payload: updatePayload,
        });
      }
      setSkill(saved);
      setSavedSignature(contentSignature(next));
      return { saved, state: next };
    } catch (error) {
      throw new SaveError(getResponseStatus(error) === 409 ? 'conflict' : 'save');
    }
  };

  const recordWithRetry = async (saved: TSkill, conversationId: string): Promise<TSkill> => {
    const variables = { id: saved._id, payload: { conversationId, version: saved.version } };
    try {
      return await depsRef.current.recordTest(variables);
    } catch (error) {
      if (getResponseStatus(error) !== 400) {
        throw error;
      }
      await (depsRef.current.wait ?? defaultWait)(TEST_RESULT_RETRY_MS);
      return depsRef.current.recordTest(variables);
    }
  };

  const runTest = async () => {
    if (trial.status === 'running') {
      return;
    }
    const current = fork ? state : withSlug(state);
    if (current !== state) {
      setState(current);
    }
    setTrial({ status: 'running', reply: '' });
    let saved: TSkill;
    let savedState: BuilderState;
    try {
      ({ saved, state: savedState } = await save(current));
    } catch (error) {
      setTrial({ status: 'failed', reason: error instanceof SaveError ? error.reason : 'save' });
      return;
    }
    if (savedState.slug !== current.slug) {
      setState((prev) => (prev.slug === current.slug ? { ...prev, slug: savedState.slug } : prev));
    }
    const spec = depsRef.current.spec;
    if (!spec) {
      setTrial({ status: 'failed', reason: 'no_agent' });
      return;
    }
    try {
      const outcome = await runTrial(depsRef.current.transport, {
        skillName: saved.name,
        prompt: starterPrompt(savedState.values) || firstSentence(savedState.text),
        spec,
        onReply: (reply) => setTrial({ status: 'running', reply }),
      });
      const recorded = await recordWithRetry(saved, outcome.conversationId);
      setSkill(recorded);
      setTrial({ status: 'passed', reply: outcome.reply });
    } catch {
      setTrial({ status: 'failed', reason: 'run' });
    }
  };

  const publishSkill = async (): Promise<TSkill | null> => {
    if (!skill || !ready || publishing) {
      return null;
    }
    setPublishing(true);
    try {
      const published = await depsRef.current.publish({
        id: skill._id,
        payload: { scope: state.scope },
      });
      setSkill(published);
      setState((prev) => ({ ...prev, scope: published.scope ?? prev.scope }));
      return published;
    } finally {
      setPublishing(false);
    }
  };

  return {
    state,
    skill,
    forkOf: fork?.id,
    changed,
    steps,
    todos,
    ready,
    tested,
    prompt,
    trial,
    publishing,
    draft,
    setText,
    copyText,
    edit,
    clearFiles,
    stepOff,
    stepsRestore,
    connector,
    setMinutes,
    setScope,
    runTest,
    publishSkill,
  };
}

export type BuilderSession = ReturnType<typeof useSession>;
