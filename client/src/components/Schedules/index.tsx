import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useChatProjectNames } from '../SidePanel/Schedules/useScheduleProjects';
import ScheduleCardSkeleton from '../SidePanel/Schedules/ScheduleCardSkeleton';
import { useSkillsInfiniteQuery } from '~/data-provider/Skills';
import { useSchedulesQuery } from '~/data-provider/Schedules';
import useRunSync from '../SidePanel/Schedules/useRunSync';
import { useHasAccess, useLocalize } from '~/hooks';
import ScheduleDialog from './ScheduleDialog';
import ScheduleCard from './ScheduleCard';

export default function Schedules() {
  const localize = useLocalize();
  const [createOpen, setCreateOpen] = useState(false);
  const { data, dataUpdatedAt, isError, isLoading, refetch } = useSchedulesQuery();
  const schedules = useMemo(() => data?.schedules ?? [], [data?.schedules]);
  const canCreate = useHasAccess({
    permissionType: PermissionTypes.SCHEDULES,
    permission: Permissions.CREATE,
  });
  const atLimit =
    data?.limits.maxPerUser !== undefined && schedules.length >= data.limits.maxPerUser;
  const { hasScopedProjects, hasScheduledSkills } = useMemo(() => {
    let hasProjects = false;
    let hasSkills = false;
    for (const schedule of schedules) {
      hasProjects ||= schedule.chatProjectId != null;
      hasSkills ||= (schedule.skills?.length ?? 0) > 0;
      if (hasProjects && hasSkills) {
        break;
      }
    }
    return { hasScopedProjects: hasProjects, hasScheduledSkills: hasSkills };
  }, [schedules]);
  const projectNames = useChatProjectNames(hasScopedProjects);
  const skillsQuery = useSkillsInfiniteQuery({ limit: 100 }, { enabled: hasScheduledSkills });
  const skillNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const page of skillsQuery.data?.pages ?? []) {
      for (const skill of page.skills) {
        names.set(skill.name, skill.displayTitle || skill.name);
      }
    }
    return names;
  }, [skillsQuery.data?.pages]);
  useRunSync(data?.schedules, dataUpdatedAt);

  let scheduleContent: ReactNode;
  if (isLoading) {
    scheduleContent = (
      <div className="space-y-3" aria-busy="true" aria-label={localize('com_ui_loading')}>
        <ScheduleCardSkeleton />
        <ScheduleCardSkeleton />
      </div>
    );
  } else if (isError) {
    scheduleContent = (
      <div className="flex flex-col items-start gap-3" role="alert">
        <p className="text-sm text-text-secondary">{localize('com_ui_schedules_error')}</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          {localize('com_ui_schedules_retry')}
        </Button>
      </div>
    );
  } else if (schedules.length === 0) {
    scheduleContent = (
      <p className="rounded-xl border border-border-light bg-surface-primary p-6 text-sm text-text-secondary">
        {localize('com_ui_schedules_empty')}
      </p>
    );
  } else {
    scheduleContent = (
      <div className="space-y-3" role="list" aria-label={localize('com_ui_schedules_title')}>
        {schedules.map((schedule) => (
          <div key={schedule.id} role="listitem">
            <ScheduleCard
              schedule={schedule}
              skillNames={skillNames}
              projectName={
                schedule.chatProjectId != null
                  ? projectNames.get(schedule.chatProjectId)
                  : undefined
              }
              canWrite={canCreate}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-secondary">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border-light bg-presentation/70 px-4 text-[14.5px] text-text-secondary backdrop-blur-md">
        <span className="font-semibold text-text-primary">
          {localize('com_ui_schedules_title')}
        </span>
        {canCreate && (
          <Button
            type="button"
            size="pill"
            variant="outline"
            disabled={atLimit || isLoading || isError}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            {localize('com_ui_schedule_new')}
          </Button>
        )}
      </header>
      <main
        role="region"
        aria-label={localize('com_ui_schedules_title')}
        className="mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col gap-3 overflow-y-auto px-6 py-4"
      >
        <h1 className="text-xl font-semibold text-text-primary">
          {localize('com_ui_schedules_title')}
        </h1>
        <p className="text-sm text-text-secondary">{localize('com_ui_schedules_description')}</p>
        {scheduleContent}
        {createOpen && (
          <ScheduleDialog open={createOpen} onOpenChange={setCreateOpen} isAtLimit={atLimit} />
        )}
      </main>
    </div>
  );
}
