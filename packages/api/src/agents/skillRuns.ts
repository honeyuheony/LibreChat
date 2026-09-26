import type { Types } from 'mongoose';
import { extractInvokedSkillsFromPayload } from './run';

type SkillId = Types.ObjectId | string;

export interface RecordTurnSkillRunsParams {
  /** Skills the user attached with `$` and the server primed into this turn. */
  manualSkillPrimes?: ReadonlyArray<{ _id: SkillId; name: string }>;
  /** Content parts of the finished response; model `skill` tool calls are read from here. */
  contentParts?: unknown[];
  accessibleSkillIds?: Types.ObjectId[];
  durationMs: number;
  getSkillByName?: (
    name: string,
    accessibleIds: Types.ObjectId[],
    options?: { preferModelInvocable?: boolean },
  ) => Promise<{ _id: SkillId; deployment?: boolean } | null>;
  recordSkillRuns: (skillIds: SkillId[], durationSeconds: number) => Promise<unknown>;
}

/** 끝난 턴에서 `$`로 붙였거나 모델이 불러온 스킬마다 실행 1회와 턴 시간을 기록하고, 기록한 id를 돌려준다. */
export async function recordTurnSkillRuns(params: RecordTurnSkillRunsParams): Promise<string[]> {
  const { manualSkillPrimes = [], contentParts = [], accessibleSkillIds = [] } = params;
  // always-apply 스킬은 모든 턴에 자동으로 붙으므로 실행으로 세지 않는다.
  const idsByKey = new Map<string, SkillId>();
  for (const prime of manualSkillPrimes) {
    idsByKey.set(prime._id.toString(), prime._id);
  }

  const manualNames = new Set(manualSkillPrimes.map((prime) => prime.name));
  const modelInvokedNames = [
    ...extractInvokedSkillsFromPayload([{ role: 'assistant', content: contentParts }]),
  ].filter((name) => !manualNames.has(name));
  if (modelInvokedNames.length > 0 && params.getSkillByName && accessibleSkillIds.length > 0) {
    const lookup = params.getSkillByName;
    // `handleSkillToolCall` resolves names the same way, so the counted doc is the one the model loaded.
    const skills = await Promise.all(
      modelInvokedNames.map((name) =>
        lookup(name, accessibleSkillIds, { preferModelInvocable: true }),
      ),
    );
    for (const skill of skills) {
      if (skill && !skill.deployment) {
        idsByKey.set(skill._id.toString(), skill._id);
      }
    }
  }

  if (idsByKey.size === 0) {
    return [];
  }
  await params.recordSkillRuns([...idsByKey.values()], params.durationMs / 1000);
  return [...idsByKey.keys()];
}
