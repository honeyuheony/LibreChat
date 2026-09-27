import { useEffect, useMemo } from 'react';
import { Spinner, useToastContext } from '@librechat/client';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { ForkOrigin } from './useSession';
import {
  useGetSkillQuery,
  useGetStartupConfig,
  useForkSkillMutation,
  useCreateSkillMutation,
  useUpdateSkillMutation,
  usePublishSkillMutation,
  isSkillDraftRateLimited,
  useCreateSkillDraftMutation,
  useRecordSkillTestResultMutation,
} from '~/data-provider';
import { useAuthContext, useHasAccess, useLocalize } from '~/hooks';
import { createTrialTransport } from './transport';
import { pickTrialSpec } from './trial';
import useSession from './useSession';
import { forkState } from './state';
import Builder from './Builder';

/** 대화에서 편집기를 열 때 넘기는 값(`navigate('/skills/new', { state })`). */
export type BuilderEntryState = { text?: string; from?: 'chat'; conversationId?: string };

const MARKET_PATH = '/skills-market';
/** 상세 창 「응용하기」가 여는 주소의 쿼리 이름(`skills/new?forkOf=<id>`). */
export const FORK_PARAM = 'forkOf';

function readEntry(state: unknown): BuilderEntryState {
  if (state == null || typeof state !== 'object') {
    return {};
  }
  const entry = state as Record<string, unknown>;
  return {
    text: typeof entry.text === 'string' ? entry.text : undefined,
    from: entry.from === 'chat' ? 'chat' : undefined,
    conversationId: typeof entry.conversationId === 'string' ? entry.conversationId : undefined,
  };
}

type EditorPageProps = { entry: BuilderEntryState; fork?: ForkOrigin; forkTitle?: string };

function EditorPage({ entry, fork, forkTitle }: EditorPageProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const { user, token } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const draftMutation = useCreateSkillDraftMutation();
  const createMutation = useCreateSkillMutation();
  const updateMutation = useUpdateSkillMutation();
  const recordMutation = useRecordSkillTestResultMutation();
  const publishMutation = usePublishSkillMutation();
  const forkMutation = useForkSkillMutation();
  const transport = useMemo(() => createTrialTransport(token), [token]);

  const session = useSession(
    {
      requestDraft: draftMutation.mutateAsync,
      isRateLimited: isSkillDraftRateLimited,
      createSkill: createMutation.mutateAsync,
      forkSkill: forkMutation.mutateAsync,
      updateSkill: updateMutation.mutateAsync,
      recordTest: recordMutation.mutateAsync,
      publish: publishMutation.mutateAsync,
      transport,
      spec: pickTrialSpec(startupConfig?.modelSpecs?.list),
      conversationId: entry.conversationId,
    },
    { text: entry.text, fork },
  );

  const author = user?.name || user?.username || '';

  const publish = async () => {
    try {
      const published = await session.publishSkill();
      if (!published) {
        return;
      }
      showToast({ status: 'success', message: localize('com_skills_builder_published') });
      navigate(`${MARKET_PATH}/mine`);
    } catch {
      showToast({ status: 'error', message: localize('com_skills_builder_publish_failed') });
    }
  };

  return (
    <Builder
      session={session}
      author={author}
      fromChat={entry.from === 'chat'}
      forkTitle={forkTitle}
      onCancel={() => navigate(MARKET_PATH)}
      onPublish={() => void publish()}
    />
  );
}

function Loading() {
  const localize = useLocalize();
  return (
    <div className="flex h-full w-full items-center justify-center bg-presentation">
      <Spinner className="text-text-secondary" aria-label={localize('com_ui_loading')} />
    </div>
  );
}

/** 원본을 읽은 뒤 원본 값으로 채운 편집기를 연다. 원본을 못 읽으면 마켓으로 돌아간다. */
function ForkEditorPage({ forkOf, entry }: { forkOf: string; entry: BuilderEntryState }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const { user } = useAuthContext();
  const original = useGetSkillQuery(forkOf);
  const failed = original.isError;
  const fork = useMemo(
    () =>
      original.data ? { id: forkOf, state: forkState(original.data, user?.department) } : null,
    [forkOf, original.data, user?.department],
  );

  useEffect(() => {
    if (!failed) {
      return;
    }
    showToast({ status: 'error', message: localize('com_skills_fork_failed') });
    navigate(MARKET_PATH, { replace: true });
  }, [failed, showToast, localize, navigate]);

  if (!fork || !original.data) {
    return <Loading />;
  }
  return (
    <EditorPage
      entry={entry}
      fork={fork}
      forkTitle={original.data.displayTitle || original.data.name}
    />
  );
}

/** `skills/new` 경로: 만들기 권한을 확인한 뒤 편집기를 연다. */
export default function Editor() {
  const location = useLocation();
  const { user, roles } = useAuthContext();
  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.CREATE,
  });
  const entry = useMemo(() => readEntry(location.state), [location.state]);
  const forkOf = new URLSearchParams(location.search).get(FORK_PARAM);

  const rolesLoaded = user?.role != null && roles?.[user.role] != null;
  if (!rolesLoaded) {
    return <Loading />;
  }
  if (!hasAccess) {
    return <Navigate to="/c/new" replace />;
  }
  if (!hasCreateAccess) {
    return <Navigate to="/skills" replace />;
  }
  if (forkOf) {
    return <ForkEditorPage key={forkOf} forkOf={forkOf} entry={entry} />;
  }
  return <EditorPage entry={entry} />;
}
