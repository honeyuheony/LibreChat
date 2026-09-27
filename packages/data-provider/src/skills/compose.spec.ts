import { load } from 'js-yaml';
import { composeSkillMarkdown } from './compose';

const input = {
  name: 'compare-table',
  displayTitle: '문서 정리·비교표',
  description: 'Compare the same fields across several documents.',
  category: '정리·분석',
  examples: ['Compare these reports.'],
  metadata: { icon: '📊', triggers: ['비교'], output: '표' },
  instructions: ['Choose the fields.', 'Read each document once.'],
  result: 'Combine the extracted values in one table.',
  access: 'Use only the documents supplied by the user.',
};

function readFrontmatter(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new Error('SKILL.md frontmatter is missing');
  return load(match[1]);
}

describe('composeSkillMarkdown', () => {
  it('puts the deployment fields at the top level and the rest under metadata', () => {
    const markdown = composeSkillMarkdown(input);

    expect(markdown).toContain('---\n');
    expect(readFrontmatter(markdown)).toEqual({
      name: 'compare-table',
      title: '문서 정리·비교표',
      description: 'Compare the same fields across several documents.',
      category: '정리·분석',
      examples: ['Compare these reports.'],
      metadata: { icon: '📊', triggers: ['비교'], output: '표' },
    });
  });

  it('numbers instructions and appends the result and access sections', () => {
    const markdown = composeSkillMarkdown(input);
    const body = markdown.split('---\n').slice(2).join('---\n').trim();

    expect(body).toBe(
      [
        '# 문서 정리·비교표',
        '',
        '1. Choose the fields.',
        '2. Read each document once.',
        '',
        '## 결과물',
        'Combine the extracted values in one table.',
        '',
        '## 접근 범위',
        'Use only the documents supplied by the user.',
      ].join('\n'),
    );
  });
});
