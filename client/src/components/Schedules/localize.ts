import type { TranslationKeys } from '~/hooks/useLocalize';
import type { LocalizeFunction } from '~/common';

export function localizeScheduleText(
  localize: LocalizeFunction,
  key: string,
  options?: Parameters<LocalizeFunction>[1],
): string {
  return localize(key as TranslationKeys, options);
}
