import { createElement } from 'react';
import { Plug } from 'lucide-react';
import { SettingsTabValues } from 'librechat-data-provider';
import { GearIcon, DataIcon, UserIcon } from '@librechat/client';
import type { ComponentType, ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks';
import ConnectorsSettings from '~/components/Connectors/ConnectorsSettings';

export type SettingsTab =
  | SettingsTabValues.GENERAL
  | SettingsTabValues.PERSONALIZATION
  | SettingsTabValues.CONNECTORS
  | SettingsTabValues.DATA;

export type SectionId =
  | 'appearance'
  | 'layout'
  | 'accessibility'
  | 'admin'
  | 'sending'
  | 'commands'
  | 'messages'
  | 'conversations'
  | 'prompts'
  | 'stt'
  | 'tts'
  | 'memory'
  | 'codeExecution'
  | 'data'
  | 'apiKeys'
  | 'langfuse'
  | 'danger'
  | 'profile'
  | 'security'
  | 'billing'
  | 'about';

export interface SettingsContextValue {
  balanceEnabled: boolean;
  hasAnyPersonalizationFeature: boolean;
  hasMemoryOptOut: boolean;
  hasStatefulCodeSessions: boolean;
  hasRemoteAgents: boolean;
  hasUserProvidedEndpoints: boolean;
  hasMultiConvo: boolean;
  hasPrompts: boolean;
  isLocalProvider: boolean;
  twoFactorEnabled: boolean;
  allowAccountDeletion: boolean;
  aboutEnabled: boolean;
  engineTTS: string;
  langfuseConnectionAccess: boolean;
  adminPanelURL: string;
}

export interface SettingEntry {
  id: string;
  tab: SettingsTab;
  section: SectionId;
  labelKey: TranslationKeys;
  keywords?: string[];
  Component: ComponentType;
  show?: (ctx: SettingsContextValue) => boolean;
}

export interface SectionMeta {
  id: SectionId;
  labelKey: TranslationKeys;
  icon?: ReactNode;
  danger?: boolean;
}

export interface TabMeta {
  id: SettingsTab;
  labelKey: TranslationKeys;
  icon: ReactNode;
  sections: SectionMeta[];
  /** Renders the whole tab instead of registry sections; such a tab has no searchable entries. */
  Panel?: ComponentType;
  show?: (ctx: SettingsContextValue) => boolean;
}

export const TABS: TabMeta[] = [
  {
    id: SettingsTabValues.GENERAL,
    labelKey: 'com_nav_setting_general',
    icon: createElement(GearIcon),
    sections: [
      { id: 'appearance', labelKey: 'com_ui_settings_section_appearance' },
      { id: 'layout', labelKey: 'com_ui_settings_section_layout' },
      { id: 'accessibility', labelKey: 'com_ui_settings_section_accessibility' },
      { id: 'admin', labelKey: 'com_ui_settings_section_admin' },
      { id: 'about', labelKey: 'com_nav_setting_about' },
    ],
  },
  {
    id: SettingsTabValues.PERSONALIZATION,
    labelKey: 'com_ui_settings_tab_personal',
    icon: createElement(UserIcon),
    sections: [
      { id: 'profile', labelKey: 'com_ui_settings_section_profile' },
      { id: 'sending', labelKey: 'com_ui_settings_section_sending' },
      { id: 'messages', labelKey: 'com_ui_settings_section_messages' },
      { id: 'conversations', labelKey: 'com_ui_settings_section_conversations' },
      { id: 'commands', labelKey: 'com_ui_settings_section_commands' },
      { id: 'prompts', labelKey: 'com_ui_settings_section_prompts' },
      { id: 'stt', labelKey: 'com_ui_settings_section_stt' },
      { id: 'tts', labelKey: 'com_ui_settings_section_tts' },
      { id: 'security', labelKey: 'com_ui_settings_section_security' },
    ],
  },
  {
    id: SettingsTabValues.CONNECTORS,
    labelKey: 'com_ui_settings_tab_connectors',
    icon: createElement(Plug, { className: 'icon-sm', 'aria-hidden': true }),
    sections: [],
    Panel: ConnectorsSettings,
  },
  {
    id: SettingsTabValues.DATA,
    labelKey: 'com_ui_settings_tab_data',
    icon: createElement(DataIcon),
    sections: [
      { id: 'memory', labelKey: 'com_ui_settings_section_memory' },
      { id: 'codeExecution', labelKey: 'com_ui_settings_section_code_execution' },
      { id: 'data', labelKey: 'com_ui_settings_section_data' },
      { id: 'apiKeys', labelKey: 'com_ui_settings_section_api_keys' },
      { id: 'danger', labelKey: 'com_ui_settings_section_danger_zone', danger: true },
    ],
  },
];
