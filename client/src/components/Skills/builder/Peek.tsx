import { useState } from 'react';
import { Button, Spinner } from '@librechat/client';
import type { PeerExample } from './peers';
import {
  runsOf,
  formatCount,
  getSkillTitle,
} from '~/components/Skills/Marketplace/skillCategories';
import SkillIcon from '~/components/Skills/Marketplace/SkillIcon';
import { useLocalize } from '~/hooks';

type PeekRowProps = {
  /** 읽는 중이면 undefined 다. */
  peers?: PeerExample[];
  onPeek?: (open: boolean) => void;
  onCopy: (peer: PeerExample) => void;
};

/** 작성자 · 부서 · 실행 수. 「By」와 응용 수는 적지 않는다. */
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
export default function PeekRow({ peers, onPeek, onCopy }: PeekRowProps) {
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
              {localize('com_skills_builder_peek_empty')}
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
                      {localize('com_skills_builder_peek_copy')}
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
