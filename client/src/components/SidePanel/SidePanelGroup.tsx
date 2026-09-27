import { useState, memo } from 'react';
import { useDefaultLayout } from 'react-resizable-panels';
import { ResizablePanel, ResizablePanelGroup, useMediaQuery } from '@librechat/client';
import type { PanelSlot } from './ArtifactsPanel';
import ArtifactsPanel from './ArtifactsPanel';

export type SidePanelKind = 'artifacts' | 'task';

const PANEL_IDS_SINGLE = ['messages-view'];

/** 기존 너비를 이어 쓰도록 artifact ID를 유지하고 panel ID마다 저장할 layout을 분리한다.
 * task panel은 기본 너비 360px로 열리고 artifact panel과 너비를 따로 저장한다.
 */
const PANEL_SLOTS: Record<SidePanelKind, PanelSlot> = {
  artifacts: { id: 'artifacts-panel', defaultSize: '50', minWidthClassName: 'min-w-[400px]' },
  task: { id: 'task-panel', defaultSize: '360px' },
};

interface SidePanelProps {
  panel?: React.ReactNode;
  panelKind?: SidePanelKind;
  children: React.ReactNode;
}

const SidePanelGroup = memo(({ panel, panelKind = 'artifacts', children }: SidePanelProps) => {
  const slot = PANEL_SLOTS[panelKind];
  const [shouldRenderPanel, setShouldRenderPanel] = useState(panel != null);
  const isSmallScreen = useMediaQuery('(max-width: 767px)');

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'side-panel-layout',
    panelIds: panel != null ? ['messages-view', slot.id] : PANEL_IDS_SINGLE,
    storage: localStorage,
  });

  const minSizeMain = panel != null ? '15' : '30';

  return (
    <>
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="relative flex-1 bg-presentation"
      >
        <ResizablePanel defaultSize="50" minSize={minSizeMain} id="messages-view">
          {children}
        </ResizablePanel>

        {!isSmallScreen && (
          <ArtifactsPanel
            panel={panel}
            slot={slot}
            minSizeMain={minSizeMain}
            shouldRender={shouldRenderPanel}
            onRenderChange={setShouldRenderPanel}
          />
        )}
      </ResizablePanelGroup>
      {panel != null && isSmallScreen && <div className="fixed inset-0 z-[100]">{panel}</div>}
    </>
  );
});

SidePanelGroup.displayName = 'SidePanelGroup';

export default SidePanelGroup;
