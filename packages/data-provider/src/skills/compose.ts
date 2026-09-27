import { dump } from 'js-yaml';
import type { SkillFrontmatterObject } from '../types/skills';

export type TSkillMarkdownComposeInput = {
  name: string;
  displayTitle?: string;
  description: string;
  category?: string;
  examples?: string[];
  metadata?: SkillFrontmatterObject;
  instructions: string[];
  result: string;
  access: string;
};

export function composeSkillMarkdown(input: TSkillMarkdownComposeInput): string {
  const title = input.displayTitle ?? input.name;
  const frontmatter = {
    name: input.name,
    title,
    description: input.description,
    ...(input.category !== undefined && { category: input.category }),
    ...(input.examples !== undefined && { examples: input.examples }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
  };
  const body = [
    `# ${title}`,
    '',
    ...input.instructions.map((instruction, index) => `${index + 1}. ${instruction}`),
    '',
    '## 결과물',
    input.result,
    '',
    '## 접근 범위',
    input.access,
  ].join('\n');
  const yaml = dump(frontmatter, { lineWidth: -1, noRefs: true }).trimEnd();
  return ['---', yaml, '---', '', body, ''].join('\n');
}
