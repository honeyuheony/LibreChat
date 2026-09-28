import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Spinner, useToastContext } from '@librechat/client';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PermissionTypes, Permissions, dataService } from 'librechat-data-provider';
import type { ForkOrigin } from './useSession';
import type { BuilderState } from './state';
import {
  useGetSkillQuery,
  useMCPServersQuery,
  useGetStartupConfig,
  useForkSkillMutation,
  useCreateSkillMutation,
  useUpdateSkillMutation,
  usePublishSkillMutation,
  useDeleteSkillFileMutation,
  useUploadSkillFileMutation,
  isSkillDraftRateLimited,
  useCreateSkillDraftMutation,
  useRecordSkillTestResultMutation,
} from '~/data-provider';
import SkillMarketplace from '~/components/Skills/Marketplace/SkillMarketplace';
import { MarketplaceProvider } from '~/components/Agents/MarketplaceContext';
import { useAuthContext, useHasAccess, useLocalize } from '~/hooks';
import { useTaskResultQuery } from '~/data-provider/Tasks';
import { createTrialTransport } from './transport';
import { chatConfirmed, chatState } from './chat';
import { pickTrialSpec } from './trial';
import useSession from './useSession';
import celebrate from './celebrate';
import { forkState } from './state';
import usePeers from './usePeers';
import Builder from './Builder';

/**
 * 대화에서 편집기를 열 때 넘기는 값(`navigate('/skills/new', { state })`).
 * `taskResultId` 는 끝난 작업의 결과, `connectors` 는 그 대화에서 쓴 MCP 서버다.
 */
export type BuilderEntryState = {
  text?: string;
  from?: 'chat';
  conversationId?: string;
  taskResultId?: string;
  connectors?: string[];
};

const MARKET_PATH = '/skills-market';

export function getPublishErrorMessageKey(
  error: unknown,
): 'com_skills_builder_department_required' | 'com_skills_builder_publish_failed' {
  if (!axios.isAxiosError<unknown>(error) || error.response?.status !== 400) {
    return 'com_skills_builder_publish_failed';
  }
  const data = error.response.data;
  return data != null &&
    typeof data === 'object' &&
    'code' in data &&
    data.code === 'DEPARTMENT_REQUIRED'
    ? 'com_skills_builder_department_required'
    : 'com_skills_builder_publish_failed';
}

/** 상세 창 「응용하기」가 여는 주소의 쿼리 이름(`skills/new?forkOf=<id>`). */
const FORK_PARAM = 'forkOf';

function readEntry(state: unknown): BuilderEntryState {
  if (state == null || typeof state !== 'object') {
    return {};
  }
  const entry = state as Record<string, unknown>;
  return {
    text: typeof entry.text === 'string' ? entry.text : undefined,
    from: entry.from === 'chat' ? 'chat' : undefined,
    conversationId: typeof entry.conversationId === 'string' ? entry.conversationId : undefined,
    taskResultId: typeof entry.taskResultId === 'string' ? entry.taskResultId : undefined,
    connectors: Array.isArray(entry.connectors)
      ? entry.connectors.filter((name): name is string => typeof name === 'string')
      : undefined,
  };
}

type EditorPageProps = {
  entry: BuilderEntryState;
  fork?: ForkOrigin;
  forkTitle?: string;
  chat?: BuilderState;
};

function EditorPage({ entry, fork, forkTitle, chat }: EditorPageProps) {
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
  const uploadFileMutation = useUploadSkillFileMutation();
  const deleteFileMutation = useDeleteSkillFileMutation();
  const { data: mcpServers } = useMCPServersQuery();
  const connectorChoices = useMemo(() => Object.keys(mcpServers ?? {}), [mcpServers]);
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
      files: {
        upload: ({ skillId, relativePath, file }) => {
          const formData = new FormData();
          formData.append('relativePath', relativePath);
          formData.append('file', file, file.name);
          return uploadFileMutation.mutateAsync({ skillId, formData });
        },
        remove: deleteFileMutation.mutateAsync,
        fetchSkill: dataService.getSkill,
      },
      transport,
      spec: pickTrialSpec(startupConfig?.modelSpecs?.list),
      conversationId: entry.conversationId,
    },
    { text: entry.text, fork, chat },
  );

  const [peeking, setPeeking] = useState(false);
  const peers = usePeers(peeking, session.state.values.output, [
    session.forkOf,
    session.skill?._id,
  ]);

  const author = user?.name || user?.username || '';

  const publish = async () => {
    try {
      const published = await session.publishSkill();
      if (!published) {
        return;
      }
      celebrate();
      showToast({
        status: 'success',
        message: localize(
          session.forkOf ? 'com_skills_builder_republished' : 'com_skills_builder_published',
        ),
      });
      navigate(`${MARKET_PATH}/mine`);
    } catch (error) {
      showToast({ status: 'error', message: localize(getPublishErrorMessageKey(error)) });
    }
  };

  return (
    <Builder
      session={session}
      author={author}
      department={user?.department}
      connectorChoices={connectorChoices}
      fromChat={entry.from === 'chat'}
      peers={peers}
      onPeek={setPeeking}
      forkTitle={forkTitle}
      onCancel={() => navigate(MARKET_PATH)}
      onPublish={() => void publish()}
    />
  );
}

function Loading() {
  const localize = useLocalize();
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center">
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

/** 끝난 작업의 결과를 읽어 대화에서 정한 칸을 채운다. 결과를 못 읽으면 요청 문장만 넣고 연다. */
function ChatEditorPage({
  entry,
  taskResultId,
}: {
  entry: BuilderEntryState;
  taskResultId: string;
}) {
  const result = useTaskResultQuery(taskResultId);
  const chat = useMemo(
    () =>
      result.data
        ? chatState(entry.text ?? '', {
            ...chatConfirmed(result.data),
            connectors: entry.connectors ?? [],
          })
        : undefined,
    [result.data, entry.text, entry.connectors],
  );
  if (result.isLoading) {
    return <Loading />;
  }
  return <EditorPage entry={entry} chat={chat} />;
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
  if (entry.from === 'chat' && entry.taskResultId) {
    return (
      <ChatEditorPage key={entry.taskResultId} entry={entry} taskResultId={entry.taskResultId} />
    );
  }
  return <EditorPage entry={entry} />;
}

/** `skills/new` 화면: 마켓을 그대로 두고 그 위에 편집기를 모달로 띄운다. */
export function MarketEditor() {
  return (
    <>
      <MarketplaceProvider>
        <SkillMarketplace />
      </MarketplaceProvider>
      <Editor />
    </>
  );
}
