import React from 'react';
import { render, screen } from '@testing-library/react';
import OutputRenderer, { cleanToolError, isError } from '../OutputRenderer';

jest.mock('copy-to-clipboard', () => jest.fn());

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Messages/Content/CopyButton', () => ({
  __esModule: true,
  default: () => <button type="button" data-testid="copy-output" />,
}));

describe('OutputRenderer', () => {
  it('vertically centers the copy control beside the output', () => {
    render(<OutputRenderer text={'First line\nSecond line'} />);

    const copyPositioner = screen.getByTestId('copy-output').parentElement;
    expect(copyPositioner).toHaveClass('absolute', 'right-0', 'top-1/2', '-translate-y-1/2');
    expect(copyPositioner?.parentElement).toHaveClass('relative', 'pr-10');
  });

  it('does not treat text between bracketed prefixes as a tool-call error', () => {
    expect(isError('Error: [agent] unexpected [search] tool call failed: unavailable')).toBe(false);
  });

  it('treats an MCP server "Error executing tool" reply as a tool error', () => {
    expect(
      isError(
        'Error executing tool read_file: PC 의 업무 에이전트 앱이 꺼져 있다. PC 에서 앱을 켠다.',
      ),
    ).toBe(true);
  });

  it('strips the "Error executing tool <name>:" prefix from the shown message', () => {
    expect(
      cleanToolError(
        'Error executing tool read_file: PC 의 업무 에이전트 앱이 꺼져 있다. PC 에서 앱을 켠다.',
      ),
    ).toBe('PC 의 업무 에이전트 앱이 꺼져 있다. PC 에서 앱을 켠다.');
  });

  it('strips the LibreChat tool-call prefix and the retry hint', () => {
    expect(
      cleanToolError(
        'Error: [MCP][hangul-docs][read_hangul_tables] tool call failed: MCP error -32001: Request timed out\n Please fix your mistakes.',
      ),
    ).toBe('MCP error -32001: Request timed out');
  });

  it('renders the relay error without its prefix', () => {
    render(
      <OutputRenderer text="Error executing tool list_folder: PC 의 업무 에이전트 앱이 꺼져 있다. PC 에서 앱을 켠다." />,
    );
    expect(screen.getByText('PC 의 업무 에이전트 앱이 꺼져 있다. PC 에서 앱을 켠다.')).toHaveClass(
      'text-status-error',
    );
  });

  /** Recorded on the demo stack when the relay answered 401 to list_folder. */
  const MCP_OAUTH_OUTPUT =
    'Error: [MCP][my-pc][list_folder] OAuth authentication required. Please check the server logs for the authentication URL.\n Please fix your mistakes.';

  it('treats an "Error: [MCP][server][tool]" reply as a tool error', () => {
    expect(isError(MCP_OAUTH_OUTPUT)).toBe(true);
  });

  it('strips the [MCP][server][tool] tags and the retry hint', () => {
    expect(cleanToolError(MCP_OAUTH_OUTPUT)).toBe(
      'OAuth authentication required. Please check the server logs for the authentication URL.',
    );
  });
});
