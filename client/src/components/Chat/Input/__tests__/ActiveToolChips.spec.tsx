import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ActiveToolChips from '../ActiveToolChips';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/ui/CustomIcon', () => ({
  __esModule: true,
  default: ({ src }: { src: string }) => <img data-testid="custom-icon" src={src} alt="" />,
}));

jest.mock('../useComposerTools', () => ({
  __esModule: true,
  default: () => ({
    switchableServers: [
      { serverName: 'drive', config: { title: 'Google Workspace' } },
      { serverName: 'law', config: { title: '법령', iconPath: '/icons/law.svg' } },
    ],
    builtinTools: [
      {
        id: 'web_search',
        label: 'Web search',
        enabled: true,
        onToggle: jest.fn(),
        icon: <svg data-testid="web-search-icon" />,
      },
    ],
    isConnectorOn: () => true,
    toggleConnector: jest.fn(),
  }),
}));

const chips = () => screen.getAllByTestId('active-tool-chip');

describe('ActiveToolChips', () => {
  it('draws each chip as a 28px pill with a brand border', () => {
    render(<ActiveToolChips showBuiltinTools showConnectors />);

    for (const chip of chips()) {
      expect(chip).toHaveClass(
        'rounded-full',
        'border-border-brand',
        'px-2.5',
        'py-[3px]',
        'leading-[19.5px]',
      );
      expect(chip).not.toHaveClass('border-accent-primary/25', 'py-0.5');
    }
  });

  it('leads each chip with the icon of its connector or tool', () => {
    render(<ActiveToolChips showBuiltinTools showConnectors />);

    const [drive, law, web] = chips();
    expect(within(drive).getByTestId('active-tool-chip-icon').querySelector('svg')).not.toBeNull();
    expect(within(law).getByTestId('custom-icon')).toHaveAttribute('src', '/icons/law.svg');
    expect(within(web).getByTestId('web-search-icon')).toBeInTheDocument();
    expect(drive.firstElementChild).toBe(within(drive).getByTestId('active-tool-chip-icon'));
  });
});
