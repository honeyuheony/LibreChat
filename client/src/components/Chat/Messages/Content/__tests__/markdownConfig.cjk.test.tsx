import { createElement } from 'react';
import ReactMarkdown from 'react-markdown';
import { render } from '@testing-library/react';
import type { Options as ReactMarkdownOptions } from 'react-markdown';
import { getRemarkPlugins } from '../markdownConfig';

/** Same cast as the production call site: unified@10 config types vs react-markdown's @11. */
const renderMarkdown = (content: string) =>
  render(
    createElement(
      ReactMarkdown,
      { remarkPlugins: getRemarkPlugins() as ReactMarkdownOptions['remarkPlugins'] },
      content,
    ),
  );

describe('getRemarkPlugins with Korean emphasis', () => {
  /** CommonMark will not close `**` after punctuation when a letter follows, which is
   *  every Korean particle written right after a bracket or a quote. */
  test.each([
    ['사업기간은 **3년(2+1년)**이며 2년 차에', '3년(2+1년)'],
    ['핵심은 **「예산 확보」**입니다', '「예산 확보」'],
    ['**630백만원.**으로 정했다', '630백만원.'],
  ])('bolds %s', (content, bold) => {
    const { container } = renderMarkdown(content);
    expect(container.querySelector('strong')?.textContent).toBe(bold);
    expect(container.textContent).not.toContain('**');
  });

  test('leaves ordinary English emphasis as it was', () => {
    const { container } = renderMarkdown('a **bold** word and **x**y');
    expect([...container.querySelectorAll('strong')].map((node) => node.textContent)).toEqual([
      'bold',
      'x',
    ]);
  });
});
