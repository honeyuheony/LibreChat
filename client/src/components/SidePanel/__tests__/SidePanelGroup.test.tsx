import { render } from '@testing-library/react';
import { ResizablePanel } from '@librechat/client';
import SidePanelGroup from '../SidePanelGroup';

jest.mock('@librechat/client', () => {
  const actual = jest.requireActual('@librechat/client');
  return {
    ...actual,
    useMediaQuery: () => false,
    ResizablePanel: jest.fn(actual.ResizablePanel),
  };
});

const ARTIFACTS_KEY = 'react-resizable-panels:side-panel-layout:messages-view:artifacts-panel';
const TASK_KEY = 'react-resizable-panels:side-panel-layout:messages-view:task-panel';

const slotProps = () =>
  (ResizablePanel as unknown as jest.Mock).mock.calls
    .map(([props]) => props as { id: string; defaultSize?: string })
    .filter((props) => props.id !== 'messages-view');

describe('SidePanelGroup', () => {
  let getItem: jest.SpyInstance;

  beforeEach(() => {
    localStorage.clear();
    (ResizablePanel as unknown as jest.Mock).mockClear();
    getItem = jest.spyOn(Storage.prototype, 'getItem');
  });

  afterEach(() => {
    getItem.mockRestore();
  });

  it('keeps the artifact panel at half the width under its existing saved layout', () => {
    render(
      <SidePanelGroup panel={<div />}>
        <div />
      </SidePanelGroup>,
    );
    expect(slotProps().at(-1)).toMatchObject({ id: 'artifacts-panel', defaultSize: '50' });
    expect(getItem).toHaveBeenCalledWith(ARTIFACTS_KEY);
    expect(getItem).not.toHaveBeenCalledWith(TASK_KEY);
  });

  it('opens the task panel at 360px under a layout of its own', () => {
    localStorage.setItem(
      ARTIFACTS_KEY,
      JSON.stringify({ 'messages-view': 50, 'artifacts-panel': 50 }),
    );
    render(
      <SidePanelGroup panel={<div />} panelKind="task">
        <div />
      </SidePanelGroup>,
    );
    expect(slotProps().at(-1)).toMatchObject({ id: 'task-panel', defaultSize: '360px' });
    expect(getItem).toHaveBeenCalledWith(TASK_KEY);
    expect(getItem).not.toHaveBeenCalledWith(ARTIFACTS_KEY);
  });
});
