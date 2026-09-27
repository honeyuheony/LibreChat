import { useEffect, memo } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { ResizableHandleAlt, ResizablePanel } from '@librechat/client';
import { cn } from '~/utils';

export interface PanelSlot {
  id: string;
  defaultSize: string;
  minWidthClassName?: string;
}

interface ArtifactsPanelProps {
  panel: React.ReactNode | null;
  slot: PanelSlot;
  minSizeMain: string;
  shouldRender: boolean;
  onRenderChange: (shouldRender: boolean) => void;
}

const ArtifactsPanel = memo(function ArtifactsPanel({
  panel,
  slot,
  minSizeMain,
  shouldRender,
  onRenderChange,
}: ArtifactsPanelProps) {
  const artifactsPanelRef = usePanelRef();

  useEffect(() => {
    if (panel != null) {
      onRenderChange(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          artifactsPanelRef.current?.expand();
        });
      });
    } else if (shouldRender) {
      onRenderChange(false);
    }
  }, [panel, shouldRender, onRenderChange, artifactsPanelRef]);

  if (!shouldRender) {
    return null;
  }

  return (
    <>
      {panel != null && (
        <ResizableHandleAlt withHandle className="bg-border-medium text-text-primary" />
      )}
      <ResizablePanel
        key={slot.id}
        defaultSize={slot.defaultSize}
        maxSize="70"
        collapsedSize="0"
        collapsible={true}
        minSize={minSizeMain}
        panelRef={artifactsPanelRef}
        id={slot.id}
      >
        <div className={cn('h-full overflow-hidden', slot.minWidthClassName)}>{panel}</div>
      </ResizablePanel>
    </>
  );
});

ArtifactsPanel.displayName = 'ArtifactsPanel';

export default ArtifactsPanel;
