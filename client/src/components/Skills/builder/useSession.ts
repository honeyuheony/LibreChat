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
import type { BuilderField, BuilderState, BuilderValues } from './state';
import type { TrialFailure, TrialView } from './TrialPanel';
import type { TrialTransport } from './trial';
import {
  isTested,
  editField,
  applyDraft,
  todoItems,
  composeSteps,
  toSavePayload,
  starterPrompt,
  firstSentence,
  isPublishReady,
  contentSignature,
  toggleConnector,
  createBuilderState,
} from './state';
import { getResponseStatus } from '~/utils/errors';
import { runTrial } from './trial';
import useDraft from './useDraft';

/** test-result 가 응답 저장보다 먼저 닿을 때를 위한 한 번의 재시도 간격. 검증 안 됨: 서버 저장 지연을 측정하지 않았다. */
const TEST_RESULT_RETRY_MS = 1000;

export type SessionDeps = {
  requestDraft: (payload: TSkillDraftRequest) => Promise<TSkillDraft>;
  isRateLimited: (error: unknown) => boolean;
  createSkill: (payload: TCreateSkill) => Promise<TSkill>;
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

export default function useSession(deps: SessionDeps, initialText = '') {
  const [state, setState] = useState<BuilderState>(() => createBuilderState(initialText));
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
  const steps = useMemo(() => composeSteps(state), [state]);
  const todos = todoItems(state, tested);
  const ready = isPublishReady(state, tested);
  const prompt = starterPrompt(state.values) || firstSentence(state.text);

  const setText = useCallback((text: string) => setState((prev) => ({ ...prev, text })), []);
  const edit = useCallback(
    <K extends BuilderField>(field: K, value: BuilderValues[K]) =>
      setState((prev) => editField(prev, field, value)),
    [],
  );
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

  const save = async (current: BuilderState): Promise<TSkill> => {
    const payload = toSavePayload(current);
    const currentSignature = contentSignature(current);
    if (skill && savedSignature === currentSignature) {
      return skill;
    }
    try {
      let saved: TSkill;
      if (!skill) {
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
          id: skill._id,
          expectedVersion: skill.version,
          payload: updatePayload,
        });
      }
      setSkill(saved);
      setSavedSignature(currentSignature);
      return saved;
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
    const current = withSlug(state);
    if (current !== state) {
      setState(current);
    }
    setTrial({ status: 'running', reply: '' });
    let saved: TSkill;
    try {
      saved = await save(current);
    } catch (error) {
      setTrial({ status: 'failed', reason: error instanceof SaveError ? error.reason : 'save' });
      return;
    }
    const spec = depsRef.current.spec;
    if (!spec) {
      setTrial({ status: 'failed', reason: 'no_agent' });
      return;
    }
    try {
      const outcome = await runTrial(depsRef.current.transport, {
        skillName: saved.name,
        prompt: starterPrompt(current.values) || firstSentence(current.text),
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
      return published;
    } finally {
      setPublishing(false);
    }
  };

  return {
    state,
    skill,
    steps,
    todos,
    ready,
    tested,
    prompt,
    trial,
    publishing,
    draft,
    setText,
    edit,
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
