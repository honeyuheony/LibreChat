import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 } from 'uuid';
import { PermissionBits } from 'librechat-data-provider';
import { Button, Label, OGDialog, OGDialogTemplate, useToastContext } from '@librechat/client';
import type { TCreateSchedule, TSkillSummary } from 'librechat-data-provider';
import {
  createScheduleCadence,
  DEFAULT_SCHEDULE_CADENCE,
  formatScheduleCadence,
  SCHEDULE_CADENCE_OPTIONS,
  SCHEDULE_TIMEZONE,
  type ScheduleCadenceOptionKey,
} from './cadence';
import { useCreateScheduleMutation } from '~/data-provider/Schedules';
import useSkillActiveState from '~/hooks/Skills/useSkillActiveState';
import { useSkillsInfiniteQuery } from '~/data-provider/Skills';
import { useListAgentsQuery } from '~/data-provider/Agents';
import { useAuthContext, useLocalize } from '~/hooks';

const FORM_ID = 'schedules-create-form';

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAtLimit: boolean;
}

function skillLabel(skill: TSkillSummary, userId?: string): string {
  const title = skill.displayTitle || skill.name;
  return skill.author !== userId ? `${title} · ${skill.authorName}` : title;
}

export default function ScheduleDialog({ open, onOpenChange, isAtLimit }: ScheduleDialogProps) {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const {
    isActive,
    isError: skillStateError,
    isLoading: skillStateLoading,
  } = useSkillActiveState();
  const skillsQuery = useSkillsInfiniteQuery({ limit: 100 }, { enabled: open });
  const {
    data: agents,
    isError: agentError,
    isLoading: agentLoading,
  } = useListAgentsQuery(
    { requiredPermission: PermissionBits.VIEW },
    { enabled: open, select: (response) => response.data },
  );
  const [selectedSkillName, setSelectedSkillName] = useState('');
  const [cadenceKey, setCadenceKey] = useState<ScheduleCadenceOptionKey>(DEFAULT_SCHEDULE_CADENCE);
  const createRequestId = useRef(v4());
  const lastAttemptedPayload = useRef<string | null>(null);

  const activeSkills = useMemo(() => {
    const active: TSkillSummary[] = [];
    for (const page of skillsQuery.data?.pages ?? []) {
      for (const skill of page.skills) {
        if (skill.userInvocable !== false && isActive(skill)) {
          active.push(skill);
        }
      }
    }
    return active;
  }, [isActive, skillsQuery.data?.pages]);
  const selectedSkill = activeSkills.find((skill) => skill.name === selectedSkillName);
  const selectedSkillTitle = selectedSkill?.displayTitle || selectedSkill?.name || '';
  const firstSkillName = activeSkills[0]?.name ?? '';
  const selectedCadenceOption = SCHEDULE_CADENCE_OPTIONS.find(
    (option) => option.key === cadenceKey,
  );
  const createSchedule = useCreateScheduleMutation({
    onSuccess: (_schedule, variables) => {
      const cadenceLabel = formatScheduleCadence(variables.cadence, localize);
      showToast({
        status: 'success',
        message: localize('com_ui_schedules_created', {
          agent: variables.name,
          cadence: cadenceLabel,
        }),
      });
      onOpenChange(false);
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_ui_error') });
    },
  });
  const hasRequestError =
    skillsQuery.isError || skillStateError || agentError || (agents?.length ?? 0) === 0;
  const isLoading =
    skillsQuery.isLoading || skillStateLoading || agentLoading || skillsQuery.isFetchingNextPage;
  const canSubmit =
    selectedSkill != null &&
    (agents?.[0]?.id ?? '') !== '' &&
    !isAtLimit &&
    !hasRequestError &&
    !isLoading &&
    !createSchedule.isLoading;

  useEffect(() => {
    if (open) {
      setSelectedSkillName(firstSkillName);
      setCadenceKey(DEFAULT_SCHEDULE_CADENCE);
    }
  }, [firstSkillName, open]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // 화면에서 고르는 agent는 스킬이므로 실제 실행 agent는 조회 목록 첫 항목을 사용한다.
    const selectedAgentId = agents?.[0]?.id;
    if (!canSubmit || selectedSkill == null || selectedCadenceOption == null || !selectedAgentId) {
      return;
    }

    // 전체 화면에는 활성 프로젝트 정보가 없어 예약을 프로젝트에 묶지 않는다.
    const scheduleDetails = {
      name: selectedSkillTitle,
      prompt: `${selectedSkillTitle}을 실행해 주세요.`,
      agent_id: selectedAgentId,
      cadence: createScheduleCadence(cadenceKey),
      timezone: SCHEDULE_TIMEZONE,
      target: 'new' as const,
      enabled: true,
      skills: [selectedSkill.name],
    };
    const payloadFingerprint = JSON.stringify(scheduleDetails);
    if (
      lastAttemptedPayload.current != null &&
      lastAttemptedPayload.current !== payloadFingerprint
    ) {
      createRequestId.current = v4();
    }
    lastAttemptedPayload.current = payloadFingerprint;
    const payload: TCreateSchedule = {
      ...scheduleDetails,
      clientRequestId: createRequestId.current,
    };
    createSchedule.mutate(payload);
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        title={localize('com_ui_schedules_dialog_title')}
        showCloseButton={false}
        className="w-11/12 max-w-2xl"
        main={
          <form id={FORM_ID} onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="schedules-skill" className="text-sm font-medium text-text-primary">
                {localize('com_ui_schedules_agent_label')}
              </Label>
              <select
                id="schedules-skill"
                className="h-10 w-full rounded-xl border border-border-light bg-surface-primary px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
                value={selectedSkillName}
                onChange={(event) => setSelectedSkillName(event.target.value)}
                disabled={isLoading || createSchedule.isLoading || activeSkills.length === 0}
                required
              >
                <option value="" disabled>
                  {localize('com_ui_schedules_no_skills')}
                </option>
                {activeSkills.map((skill) => (
                  <option key={skill._id} value={skill.name}>
                    {skillLabel(skill, user?.id)}
                  </option>
                ))}
              </select>
              {skillsQuery.hasNextPage && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto justify-start px-0 text-xs"
                  onClick={() => void skillsQuery.fetchNextPage()}
                  disabled={skillsQuery.isFetchingNextPage || createSchedule.isLoading}
                >
                  {localize('com_ui_load_more')}
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedules-cadence" className="text-sm font-medium text-text-primary">
                {localize('com_ui_schedule_frequency')}
              </Label>
              <select
                id="schedules-cadence"
                className="h-10 w-full rounded-xl border border-border-light bg-surface-primary px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary"
                value={cadenceKey}
                onChange={(event) => setCadenceKey(event.target.value as ScheduleCadenceOptionKey)}
                disabled={createSchedule.isLoading}
              >
                {SCHEDULE_CADENCE_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {localize(option.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            {isAtLimit && (
              <p className="text-sm text-text-secondary md:col-span-2" role="alert">
                {localize('com_ui_schedules_limit_reached')}
              </p>
            )}
            {(skillsQuery.isError || skillStateError || agentError) && (
              <p className="text-sm text-status-error-strong md:col-span-2" role="alert">
                {localize('com_ui_error')}
              </p>
            )}
            {!isLoading && (agents?.length ?? 0) === 0 && !agentError && (
              <p className="text-sm text-text-secondary md:col-span-2" role="alert">
                {localize('com_ui_schedules_no_agent')}
              </p>
            )}
          </form>
        }
        buttons={
          <Button
            type="submit"
            form={FORM_ID}
            variant="submit"
            disabled={!canSubmit || createSchedule.isLoading}
            aria-label={localize('com_ui_create')}
          >
            {localize(createSchedule.isLoading ? 'com_ui_loading' : 'com_ui_create')}
          </Button>
        }
      />
    </OGDialog>
  );
}
