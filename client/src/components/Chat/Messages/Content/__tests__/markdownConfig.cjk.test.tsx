import { createElement } from 'react';
import ReactMarkdown from 'react-markdown';
import { render } from '@testing-library/react';
import type { Options as ReactMarkdownOptions } from 'react-markdown';
import { getRemarkPlugins } from '../markdownConfig';

/** unified@10과 react-markdown@11의 설정 타입이 달라 실제 호출부처럼 단언한다. */
const renderMarkdown = (content: string) =>
  render(
    createElement(
      ReactMarkdown,
      { remarkPlugins: getRemarkPlugins() as ReactMarkdownOptions['remarkPlugins'] },
      content,
    ),
  );

describe('getRemarkPlugins with Korean emphasis', () => {
  /** 괄호나 따옴표 뒤 한글 조사가 이어지면 CommonMark가 `**` 강조를 닫지 않는다. */
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
