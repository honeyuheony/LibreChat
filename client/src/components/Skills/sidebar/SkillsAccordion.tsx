import { Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import { Button, useMediaQuery } from '@librechat/client';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import { AdminSettings } from '~/components/Skills/buttons';
import { useAuthContext, useLocalize } from '~/hooks';
import SkillsSidePanel from './SkillsSidePanel';
import { PanelFooter } from '~/components/ui';

export default function SkillsAccordion() {
  const { user } = useAuthContext();
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { setSidebarOpen } = useSidebarToggle();

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="shrink-0 px-3 pb-2 pt-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-9 w-full justify-start gap-2 px-2 text-text-primary hover:bg-surface-hover"
        >
          <Link
            to="/skills-market"
            data-testid="skills-panel-marketplace-link"
            onClick={(event) => {
              if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
                return;
              }
              if (isSmallScreen) {
                setSidebarOpen(false);
              }
            }}
          >
            <Store className="size-4 shrink-0 text-text-primary" aria-hidden="true" />
            <span>{localize('com_skills_marketplace')}</span>
          </Link>
        </Button>
      </div>
      <SkillsSidePanel className="min-h-0 flex-1 border-r-0" />
      {user?.role === SystemRoles.ADMIN && (
        <PanelFooter>
          <AdminSettings />
        </PanelFooter>
      )}
    </div>
  );
}
