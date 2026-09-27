import { useMemo } from 'react';
import { useSetAtom } from 'jotai';
import { ScrollText } from 'lucide-react';
import { Permissions, PermissionTypes, isAssistantsEndpoint } from 'librechat-data-provider';
import type { MenuItemProps } from '~/common';
import { useLocalize, useHasAccess, useGetAgentsConfig, useAgentCapabilities } from '~/hooks';
import { showSkillsPopoverFamily } from './skillsState';

/** `+` 메뉴에서도 `/` 명령과 같은 권한·기능 조건으로 스킬 선택기를 연다. */
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
        /* 메뉴가 닫히며 메뉴 버튼에 돌아간 포커스를 스킬 선택기가 가져가도록 실행을 미룬다. */
        onClick: () => {
          setTimeout(() => setShowSkillsPopover(true), 0);
        },
      },
    ];
  }, [available, localize, setShowSkillsPopover]);
}
