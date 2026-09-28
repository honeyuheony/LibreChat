import { memo } from 'react';
import type { NavLink } from '~/common';
import ExpandedPanel from './ExpandedPanel';

function Sidebar({
  links,
  expanded,
  onCollapse,
  onExpand,
  onLeaveInsights,
}: {
  links: NavLink[];
  expanded: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onLeaveInsights: () => void;
}) {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <ExpandedPanel
        links={links}
        expanded={expanded}
        onCollapse={onCollapse}
        onExpand={onExpand}
        onLeaveInsights={onLeaveInsights}
      />
    </div>
  );
}

export default memo(Sidebar);
