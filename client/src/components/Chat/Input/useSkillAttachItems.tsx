import { useMemo } from 'react';
import { useSetAtom } from 'jotai';
import { ScrollText } from 'lucide-react';
import { Permissions, PermissionTypes, isAssistantsEndpoint } from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import { useLocalize, useHasAccess, useGetAgentsConfig, useAgentCapabilities } from '~/hooks';
import { showSkillsPopoverFamily } from './skillsState';

/**
 * The `+` menu's "attach a skill" entry. It opens the same skill picker the `$`
 * command opens, under the same access and capability checks.
 */
export default function useSkillAttachItems(
  index: number,
  endpoint?: string | null,
): MenuItemProps[] {
  const localize = useLocalize();
  const hasSkillsAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  const { agentsConfig } = useGetAgentsConfig();
  const { skillsEnabled } = useAgentCapabilities(agentsConfig?.capabilities);
  const setShowSkillsPopover = useSetAtom(showSkillsPopoverFamily(index));

  const available = hasSkillsAccess && skillsEnabled && !isAssistantsEndpoint(endpoint);

  return useMemo<MenuItemProps[]>(() => {
    if (!available) {
      return [];
    }
    return [
      {
        id: 'composer-attach-skill',
        label: localize('com_ui_attach_skill'),
        icon: <ScrollText className="icon-md" aria-hidden="true" />,
        /* Deferred past the menu's own close, which hands focus back to its
           trigger; the picker takes focus when it mounts. */
        onClick: () => {
          setTimeout(() => setShowSkillsPopover(true), 0);
        },
      },
    ];
  }, [available, localize, setShowSkillsPopover]);
}
