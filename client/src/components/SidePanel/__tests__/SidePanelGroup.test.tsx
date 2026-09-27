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
const TASK_ID = 'task-side-panel';
const TASK_KEY = `react-resizable-panels:side-panel-layout:messages-view:${TASK_ID}`;

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
    expect(slotProps().at(-1)).toMatchObject({ id: TASK_ID, defaultSize: '360px' });
    expect(getItem).toHaveBeenCalledWith(TASK_KEY);
    expect(getItem).not.toHaveBeenCalledWith(ARTIFACTS_KEY);
  });

  describe('in a 1180px wide group', () => {
    const GROUP_WIDTH = 1180;
    let offsetWidth: PropertyDescriptor | undefined;

    const taskPanelWidth = (container: HTMLElement) => {
      const panel = container.querySelector<HTMLElement>(`[data-panel][id="${TASK_ID}"]`);
      return (Number(panel?.style.flexGrow) / 100) * GROUP_WIDTH;
    };

    beforeEach(() => {
      offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        configurable: true,
        get(this: HTMLElement) {
          return this.hasAttribute('data-panel') ? GROUP_WIDTH / 2 : 0;
        },
      });
    });

    afterEach(() => {
      if (offsetWidth) {
        Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
      }
    });

    it('opens the task panel 360px wide on a first visit', () => {
      const { container } = render(
        <SidePanelGroup panel={<div />} panelKind="task">
          <div />
        </SidePanelGroup>,
      );
      expect(taskPanelWidth(container)).toBeCloseTo(360, 0);
    });

    it('still splits the artifact panel half and half', () => {
      const { container } = render(
        <SidePanelGroup panel={<div />}>
          <div />
        </SidePanelGroup>,
      );
      const panel = container.querySelector<HTMLElement>('[data-panel][id="artifacts-panel"]');
      expect(Number(panel?.style.flexGrow)).toBeCloseTo(50, 1);
    });

    it('does not reuse a width saved under the earlier task panel key', () => {
      localStorage.setItem(
        'react-resizable-panels:side-panel-layout:messages-view:task-panel',
        JSON.stringify({ 'messages-view': 62.106, 'task-panel': 37.894 }),
      );
      const { container } = render(
        <SidePanelGroup panel={<div />} panelKind="task">
          <div />
        </SidePanelGroup>,
      );
      expect(taskPanelWidth(container)).toBeCloseTo(360, 0);
    });
  });
});
