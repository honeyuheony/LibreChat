import { atom } from 'jotai';
import type { SettingsTab } from './types';

/** The tab the settings dialog is open on, or `null` while it is closed. */
export const settingsDialogTabAtom = atom<SettingsTab | null>(null);
