import React from 'react';
import { ScrollText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSetRecoilState } from 'recoil';
import { Button, OGDialogContent } from '@librechat/client';
import { Constants } from 'librechat-data-provider';
import type { TSkillSummary } from 'librechat-data-provider';
import { getCategoryLabel, getSkillSummary, getSkillTitle } from './skillCategories';
import { ephemeralAgentByConvoId } from '~/store';
import { useLocalize } from '~/hooks';
import store from '~/store';

interface SkillDetailContentProps {
  skill: TSkillSummary;
}

/** Detail dialog for one skill. "Use in chat" mirrors what picking the skill from
 *  the `$` popover does (SkillsCommand.handleSelect) for the new-conversation slot,
 *  then opens a new chat so the skill is primed for the first message. */
export default function SkillDetailContent({ skill }: SkillDetailContentProps) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const setEphemeralAgent = useSetRecoilState(ephemeralAgentByConvoId(Constants.NEW_CONVO));
  const setPendingManualSkills = useSetRecoilState(
    store.pendingManualSkillsByConvoId(Constants.NEW_CONVO),
  );

  /** `prefill` 이 있으면 새 대화 입력창에 그 문장을 미리 채운다(useQueryParams 가 `prompt` 쿼리 값을 읽어 반영). */
  const startChat = (prefill?: string) => {
    setEphemeralAgent((prev) => (prev?.skills ? prev : { ...(prev || {}), skills: true }));
    setPendingManualSkills((prev) => (prev.includes(skill.name) ? prev : [...prev, skill.name]));
    navigate(prefill ? `/c/new?prompt=${encodeURIComponent(prefill)}` : '/c/new');
  };

  const categoryLabel = skill.category ? getCategoryLabel(skill.category, localize) : '';
  const sourceMetadata = skill.sourceMetadata;
  const isFromDeployment =
    (sourceMetadata && !('provider' in sourceMetadata) && sourceMetadata.deployment === true) ||
    skill.authorName === 'Deployment';

  return (
    <OGDialogContent className="max-h-[90vh] w-11/12 max-w-lg overflow-y-auto">
      <div className="mt-6 flex justify-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-surface-tertiary">
          <ScrollText className="size-8 text-status-info" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-3 text-center">
        <h2 className="text-2xl font-bold text-text-primary">{getSkillTitle(skill)}</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {`$${skill.name}`}
          {categoryLabel && ` · ${categoryLabel}`}
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          {isFromDeployment
            ? localize('com_skills_by_deployment')
            : localize('com_skills_by_author', { author: skill.authorName })}
        </p>
      </div>
      <p className="mt-4 whitespace-pre-wrap px-6 text-center text-base text-text-primary">
        {getSkillSummary(skill)}
      </p>
      {skill.examples && skill.examples.length > 0 && (
        <div className="mt-6 px-6">
          <h3 className="text-sm font-semibold text-text-secondary">
            {localize('com_skills_examples')}
          </h3>
          <div className="mt-2 flex flex-col gap-2">
            {skill.examples.map((example, index) => (
              <Button
                key={index}
                variant="outline"
                className="h-auto w-full whitespace-pre-wrap text-left"
                onClick={() => startChat(example)}
              >
                {example}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="mb-4 mt-6 flex justify-center">
        <Button variant="submit" className="w-full max-w-xs" onClick={() => startChat()}>
          {localize('com_skills_use_in_chat')}
        </Button>
      </div>
    </OGDialogContent>
  );
}
