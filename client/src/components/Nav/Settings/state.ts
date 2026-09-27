import { atom } from 'jotai';
import type { SettingsTab } from './types';

export const settingsDialogTabAtom = atom<SettingsTab | null>(null);
