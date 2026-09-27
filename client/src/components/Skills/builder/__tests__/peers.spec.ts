import type { TSkill, TSkillSummary } from 'librechat-data-provider';
import { PEER_LIMIT, peerExample, pickPeers } from '../peers';

const summary = (id: string, category: string, useCount: number) =>
  ({ _id: id, name: id, category, useCount }) as TSkillSummary;

describe('pickPeers', () => {
  const skills = [
    summary('analysis-top', '정리·분석', 900),
    summary('writing-low', '문서작성', 10),
    summary('writing-high', '문서작성', 500),
    summary('review', '검토', 700),
    summary('writing-mid', '문서작성', 100),
  ];

  it('puts the same output kind first, then more runs, and keeps three', () => {
    expect(pickPeers(skills, 'report', new Set()).map((skill) => skill._id)).toEqual([
      'writing-high',
      'writing-mid',
      'writing-low',
    ]);
    expect(PEER_LIMIT).toBe(3);
  });

  it('falls back to the most-run agents of other kinds', () => {
    expect(pickPeers(skills, 'summary', new Set()).map((skill) => skill._id)).toEqual([
      'analysis-top',
      'review',
      'writing-high',
    ]);
  });

  it('leaves out the original being adapted and the draft being edited', () => {
    expect(
      pickPeers(skills, 'report', new Set(['writing-high', 'writing-mid'])).map(
        (skill) => skill._id,
      ),
    ).toEqual(['writing-low', 'analysis-top', 'review']);
  });
});

describe('peerExample', () => {
  const base = { _id: 'x', name: 'x', frontmatter: {} } as unknown as TSkill;

  it('uses the text written in the editor when the agent was written directly', () => {
    const skill = { ...base, body: '1. 무시', builder: { direct: true, text: '첫 줄.\n둘째 줄.' } };
    expect(peerExample(skill as TSkill)?.text).toBe('첫 줄.\n둘째 줄.');
  });

  it('otherwise uses the numbered lines of the body', () => {
    const skill = { ...base, body: '# 제목\n\n1. 금주 실적을 적는다.\n2. 차주 계획을 적는다.\n' };
    expect(peerExample(skill as TSkill)?.text).toBe('금주 실적을 적는다.\n차주 계획을 적는다.');
  });

  it('skips an agent with no instructions', () => {
    expect(peerExample({ ...base, body: '' } as TSkill)).toBeNull();
  });
});
