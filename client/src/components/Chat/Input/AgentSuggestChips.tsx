import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { Button } from '@librechat/client';
import { X, ScrollText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import type { TSkillSummary } from 'librechat-data-provider';
import type { BuilderEntryState } from '~/components/Skills/builder/Editor';
import { useLocalize, useSkillActiveState } from '~/hooks';
import { useSkillsInfiniteQuery } from '~/data-provider';
import useDebounce from '~/hooks/Input/useDebounce';
import { ephemeralAgentByConvoId } from '~/store';
import { isUserInvocable } from './SkillsCommand';
import store from '~/store';

export const BUILDER_PATH = '/skills/new';

const AGENT_BUILD_REQUEST = /(agent|에이전트).{0,14}(만들|생성|저장)/i;
const AGENT_BUILD_TAIL =
  /(하는|해주는|해 주는)?\s*(agent|에이전트)(를|을)?\s*(하나)?\s*(만들어|생성해|저장해)\s*(줘|주세요|줄래)?\.?$/i;
/** 배포 스킬의 기본 agent는 추천하지 않는다. */
const BASE_KIND = '기본';
const MAX_SUGGESTIONS = 3;
const SUGGEST_DELAY_MS = 400;

export const builderEntryByConvoId = atomFamily((_conversationId: string) =>
  atom<BuilderEntryState | null>(null),
);

export function readAgentBuildRequest(text: string): string | null {
  const request = text.trim();
  if (!AGENT_BUILD_REQUEST.test(request)) {
    return null;
  }
  return request.replace(AGENT_BUILD_TAIL, '').trim() || request;
}

export function matchSuggestedSkills<T extends TSkillSummary>(
  skills: T[],
  text: string,
  isActive: (skill: T) => boolean,
): T[] {
  if (text.trim() === '') {
    return [];
  }
  return skills
    .filter((skill) => {
      const profile = skill.marketProfile;
      if (profile?.kind === BASE_KIND || !isUserInvocable(skill)) {
        return false;
      }
      // 목록 응답은 배포·사용자 스킬의 frontmatter triggers를 marketProfile에 담는다.
      const triggers = profile?.triggers ?? [];
      return (
        triggers.some((trigger) => trigger !== '' && text.includes(trigger)) && isActive(skill)
      );
    })
    .sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0))
    .slice(0, MAX_SUGGESTIONS);
}

function EditorOpenedNotice({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [entry, setEntry] = useAtom(builderEntryByConvoId(conversationId));

  if (entry == null) {
    return null;
  }

  return (
    <div
      role="status"
      data-testid="agent-editor-notice"
      className="flex items-start gap-2 rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-secondary"
    >
      <p className="min-w-0 flex-1">{localize('com_skills_chat_editor_opened')}</p>
      <Button
        type="button"
        size="sm"
        variant="submit"
        onClick={() => navigate(BUILDER_PATH, { state: entry })}
      >
        {localize('com_skills_chat_open_editor')}
      </Button>
      <button
        type="button"
        aria-label={localize('com_ui_close')}
        onClick={() => setEntry(null)}
        className="rounded-full p-1 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function SuggestedSkills({ conversationId, text }: { conversationId: string; text: string }) {
  const localize = useLocalize();
  const { isActive } = useSkillActiveState();
  const pendingSkills = useRecoilValue(store.pendingManualSkillsByConvoId(conversationId));
  const setPendingSkills = useSetRecoilState(store.pendingManualSkillsByConvoId(conversationId));
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(conversationId));
  const [dismissedText, setDismissedText] = useState<string | null>(null);
  const settledText = useDebounce(text, SUGGEST_DELAY_MS);
  const wantsSuggestions = settledText.trim() !== '' && pendingSkills.length === 0;

  const { data, hasNextPage, isFetchingNextPage, isError, fetchNextPage } = useSkillsInfiniteQuery(
    { limit: 50 },
    { enabled: wantsSuggestions },
  );

  /** `/` 창과 같은 query를 써서 받아 둔 페이지를 공유한다. */
  useEffect(() => {
    if (wantsSuggestions && hasNextPage && !isFetchingNextPage && !isError) {
      fetchNextPage();
    }
  }, [wantsSuggestions, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const suggestions = useMemo(() => {
    if (!wantsSuggestions || settledText === dismissedText || !data?.pages) {
      return [];
    }
    const skills = data.pages.flatMap((page) => page.skills);
    return matchSuggestedSkills(skills, settledText, isActive);
  }, [wantsSuggestions, settledText, dismissedText, data?.pages, isActive]);

  const pick = useCallback(
    (name: string) => {
      setEphemeralAgent((prev) => (prev?.skills ? prev : { ...(prev || {}), skills: true }));
      setPendingSkills((prev) => (prev.includes(name) ? prev : [...prev, name]));
    },
    [setEphemeralAgent, setPendingSkills],
  );

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div
      role="group"
      data-testid="agent-suggest-chips"
      aria-label={localize('com_skills_chat_suggest_found', { count: suggestions.length })}
      className="flex flex-wrap items-center gap-1.5 px-2 pt-2"
    >
      <span className="text-xs text-text-secondary">{localize('com_skills_chat_suggest')}</span>
      {suggestions.map((skill) => (
        <button
          key={skill._id}
          type="button"
          onClick={() => pick(skill.name)}
          className="inline-flex items-center gap-1 rounded-full border border-border-light bg-surface-secondary px-2 py-0.5 text-xs text-text-primary hover:bg-surface-tertiary"
        >
          {skill.icon ? (
            <span aria-hidden="true">{skill.icon}</span>
          ) : (
            <ScrollText className="h-3 w-3 text-status-info" aria-hidden="true" />
          )}
          <span className="max-w-[12rem] truncate">{skill.displayTitle ?? skill.name}</span>
        </button>
      ))}
      <button
        type="button"
        aria-label={localize('com_skills_chat_suggest_dismiss')}
        onClick={() => setDismissedText(settledText)}
        className="rounded-full p-0.5 text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}

/** 스킬 범위를 지정한 대화에서는 agent 추천 칩을 표시하지 않는다. */
function AgentSuggestChips({
  conversationId,
  text,
  suggestEnabled,
}: {
  conversationId: string;
  text: string;
  suggestEnabled: boolean;
}) {
  return (
    <>
      <EditorOpenedNotice conversationId={conversationId} />
      {suggestEnabled && <SuggestedSkills conversationId={conversationId} text={text} />}
    </>
  );
}

export default memo(AgentSuggestChips);
