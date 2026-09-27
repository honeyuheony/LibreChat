import type { TSkill, TSkillSummary, TSkillDraftOutput } from 'librechat-data-provider';
import { runsOf } from '~/components/Skills/Marketplace/skillCategories';
import { originalLines } from './state';

/** 「다른 사람이 쓴 예 보기」에 띄운 agent 와 그 글. */
export type PeerExample = { skill: TSkill; text: string };

/** 와이어프레임 v29 `renderNewAgent` 의 `.slice(0,3)`. */
export const PEER_LIMIT = 3;

/** 결과물 종류가 속한 마켓 분류(와이어프레임 `catOf`). */
const OUTPUT_CATEGORY: Record<TSkillDraftOutput, string> = {
  report: '문서작성',
  draft: '문서작성',
  organize: '정리·분석',
  summary: '정리·분석',
  ask: '정리·분석',
};

/** 결과물 종류가 같은 분류를 앞에, 그다음 실행 수 많은 순으로 세 개를 고른다. */
export function pickPeers(
  skills: TSkillSummary[],
  output: TSkillDraftOutput,
  exclude: ReadonlySet<string>,
): TSkillSummary[] {
  const category = OUTPUT_CATEGORY[output];
  const same = (skill: TSkillSummary) => (skill.category === category ? 1 : 0);
  return skills
    .filter((skill) => !exclude.has(skill._id))
    .sort((a, b) => same(b) - same(a) || runsOf(b) - runsOf(a))
    .slice(0, PEER_LIMIT);
}

/** 사람이 읽을 문장만 남긴다: 링크는 글자만, 백틱·굵게·줄머리 기호는 걷어 낸다. */
const plainLine = (line: string) =>
  line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`|\*\*|__/g, '')
    .replace(/^\s*(?:[-*+>]|#+)\s+/, '')
    .trim();

/** 응용하기와 같은 줄(`originalLines`)을 뽑아 읽기 쉬운 문장으로 바꾼다. 글이 없는 agent 는 null 이다. */
export function peerExample(skill: TSkill): PeerExample | null {
  const text = originalLines(skill).split('\n').map(plainLine).filter(Boolean).join('\n');
  return text ? { skill, text } : null;
}
