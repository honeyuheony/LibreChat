import React from 'react';
import { render, screen } from '@testing-library/react';
import ModelSelector from '../ModelSelector';

jest.mock('../ModelSelectorContext', () => ({
  ModelSelectorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useModelSelectorContext: () => ({
    agentsMap: {},
    modelSpecs: [{ name: 'default-agent', label: 'GPT-6 Luna', preset: { endpoint: 'agents' } }],
    mappedEndpoints: [],
    endpointsConfig: {},
    searchValue: '',
    searchResults: null,
    selectedValues: { endpoint: 'agents', model: '', modelSpec: 'default-agent' },
    setSearchValue: jest.fn(),
    setSelectedValues: jest.fn(),
    keyDialogOpen: false,
    onOpenChange: jest.fn(),
    keyDialogEndpoint: null,
  }),
}));

jest.mock('../ModelSelectorChatContext', () => ({
  ModelSelectorChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../CustomMenu', () => ({
  CustomMenu: ({ trigger }: { trigger: React.ReactNode }) => <>{trigger}</>,
}));

jest.mock('../DialogManager', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@librechat/client', () => ({
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => <>{render}</>,
}));

jest.mock('~/hooks/useKeyboardShortcuts', () => ({
  useShortcutHint: (_id: string, label: string) => label,
  useShortcutAriaKey: () => undefined,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('ModelSelector', () => {
  it('shows the selected spec label on the trigger', () => {
    render(<ModelSelector startupConfig={undefined} />);
    expect(screen.getByTestId('model-selector-button')).toHaveTextContent('GPT-6 Luna');
  });

  /** 입력창 아랫줄은 내용 폭만큼만 차지하므로, 퍼센트 최대 폭은 0 근처로 줄어 이름이 잘린다. */
  it('caps the wrapper width without a percentage of its shrink-to-fit parent', () => {
    render(<ModelSelector startupConfig={undefined} />);
    const wrapper = screen.getByTestId('model-selector-button').parentElement as HTMLElement;
    const percentMaxWidth = wrapper.className.split(' ').filter((c) => /^max-w-\[\d+%\]$/.test(c));
    expect(percentMaxWidth).toEqual([]);
  });
});
