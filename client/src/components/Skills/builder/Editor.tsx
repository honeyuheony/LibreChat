import { useMemo } from 'react';
import { Spinner, useToastContext } from '@librechat/client';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import {
  useGetStartupConfig,
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
import Builder from './Builder';

/** 대화에서 편집기를 열 때 넘기는 값(`navigate('/skills/new', { state })`). */
export type BuilderEntryState = { text?: string; from?: 'chat'; conversationId?: string };

const MARKET_PATH = '/skills-market';

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

function EditorPage({ entry }: { entry: BuilderEntryState }) {
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
  const transport = useMemo(() => createTrialTransport(token), [token]);

  const session = useSession(
    {
      requestDraft: draftMutation.mutateAsync,
      isRateLimited: isSkillDraftRateLimited,
      createSkill: createMutation.mutateAsync,
      updateSkill: updateMutation.mutateAsync,
      recordTest: recordMutation.mutateAsync,
      publish: publishMutation.mutateAsync,
      transport,
      spec: pickTrialSpec(startupConfig?.modelSpecs?.list),
      conversationId: entry.conversationId,
    },
    entry.text ?? '',
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
      onCancel={() => navigate(MARKET_PATH)}
      onPublish={() => void publish()}
    />
  );
}

/** `skills/new` 경로: 만들기 권한을 확인한 뒤 편집기를 연다. */
export default function Editor() {
  const localize = useLocalize();
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

  const rolesLoaded = user?.role != null && roles?.[user.role] != null;
  if (!rolesLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-presentation">
        <Spinner className="text-text-secondary" aria-label={localize('com_ui_loading')} />
      </div>
    );
  }
  if (!hasAccess) {
    return <Navigate to="/c/new" replace />;
  }
  if (!hasCreateAccess) {
    return <Navigate to="/skills" replace />;
  }
  return <EditorPage entry={entry} />;
}
