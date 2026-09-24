import { useContext, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Store } from 'lucide-react';
import { Button, TooltipAnchor } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useLocalize, useHasAccess, AuthContext } from '~/hooks';

interface SkillMarketplaceButtonProps {
  side?: 'right' | 'bottom';
  onNavigate?: () => void;
}

/** Skill Marketplace entry in the sidebar, modelled on AgentMarketplaceButton.
 *  Gated on the SKILLS/USE permission so it disappears where skills are off. */
export default function SkillMarketplaceButton({
  side = 'right',
  onNavigate,
}: SkillMarketplaceButtonProps) {
  const localize = useLocalize();
  const authContext = useContext(AuthContext);
  const hasAccessToSkills = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  const authReady = useMemo(
    () =>
      authContext?.isAuthenticated !== undefined &&
      (authContext?.isAuthenticated === false || authContext?.user !== undefined),
    [authContext?.isAuthenticated, authContext?.user],
  );

  if (!authReady || !hasAccessToSkills) {
    return null;
  }

  return (
    <TooltipAnchor
      side={side}
      description={localize('com_skills_marketplace')}
      render={
        <Button asChild variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0">
          <Link
            to="/skills-market"
            data-testid="nav-skills-marketplace-button"
            aria-label={localize('com_skills_marketplace')}
            onClick={(event) => {
              if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
                return;
              }
              onNavigate?.();
            }}
          >
            <Store className="h-5 w-5 text-text-primary" aria-hidden="true" />
          </Link>
        </Button>
      }
    />
  );
}
