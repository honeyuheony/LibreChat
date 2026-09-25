import { isValidElementType } from 'react-is';
import { SettingsTabValues } from 'librechat-data-provider';
import type { SettingsContextValue } from '../types';
import ConnectorsSettings from '~/components/Connectors/ConnectorsSettings';
import en from '~/locales/en/translation.json';
import { registry } from '../registry';
import { TABS } from '../types';

const validTabSections = new Map(TABS.map((t) => [t.id, new Set(t.sections.map((s) => s.id))]));

const settingsContext: SettingsContextValue = {
  balanceEnabled: false,
  hasAnyPersonalizationFeature: false,
  hasMemoryOptOut: false,
  hasStatefulCodeSessions: false,
  hasRemoteAgents: false,
  hasUserProvidedEndpoints: false,
  hasMultiConvo: false,
  hasPrompts: false,
  isLocalProvider: true,
  twoFactorEnabled: false,
  allowAccountDeletion: true,
  aboutEnabled: false,
  engineTTS: 'browser',
  langfuseConnectionAccess: false,
  adminPanelURL: '',
};

describe('settings registry', () => {
  it('has unique ids', () => {
    const ids = registry.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('references a valid tab and section for every entry', () => {
    for (const entry of registry) {
      const sections = validTabSections.get(entry.tab);
      expect(sections).toBeDefined();
      expect(sections!.has(entry.section)).toBe(true);
    }
  });

  it('uses label keys that exist in the English locale', () => {
    for (const entry of registry) {
      expect(en).toHaveProperty(entry.labelKey);
    }
  });

  it('has a renderable Component for every entry', () => {
    for (const entry of registry) {
      expect(isValidElementType(entry.Component)).toBe(true);
    }
  });

  describe('tab placement', () => {
    const tabOf = (id: string) => registry.find((entry) => entry.id === id)?.tab;

    it('keeps appearance and build info under General', () => {
      expect(tabOf('theme')).toBe(SettingsTabValues.GENERAL);
      expect(tabOf('about')).toBe(SettingsTabValues.GENERAL);
    });

    it('gathers profile, chat behaviour, speech and security under Personal', () => {
      for (const id of ['avatar', 'enterToSend', 'speechToText', 'textToSpeech', 'twoFactor']) {
        expect(tabOf(id)).toBe(SettingsTabValues.PERSONALIZATION);
      }
    });

    it('moves account deletion to the Data danger zone', () => {
      expect(registry.find((entry) => entry.id === 'deleteAccount')).toMatchObject({
        tab: SettingsTabValues.DATA,
        section: 'danger',
      });
    });

    it('drops right-to-left chat direction and mid-chat endpoint switching', () => {
      expect(tabOf('chatDirection')).toBeUndefined();
      expect(tabOf('modularChat')).toBeUndefined();
    });

    it('lists no entries under the Connectors tab, which renders its own panel', () => {
      expect(registry.filter((entry) => entry.tab === SettingsTabValues.CONNECTORS)).toEqual([]);
      expect(TABS.find((tab) => tab.id === SettingsTabValues.CONNECTORS)?.Panel).toBe(
        ConnectorsSettings,
      );
    });
  });

  describe('prompt settings visibility', () => {
    const promptEntries = registry.filter((entry) => entry.section === 'prompts');

    it('covers the three prompt settings', () => {
      expect(promptEntries.map((entry) => entry.id).sort()).toEqual([
        'advancedPrompts',
        'alwaysMakeProd',
        'autoSendPrompts',
      ]);
    });

    it('hides them where the prompt library is off', () => {
      for (const entry of promptEntries) {
        expect(entry.show?.({ ...settingsContext, hasPrompts: false })).toBe(false);
      }
    });

    it('shows them where the prompt library is on', () => {
      for (const entry of promptEntries) {
        expect(entry.show?.({ ...settingsContext, hasPrompts: true })).toBe(true);
      }
    });
  });

  describe('stateful workspace default visibility', () => {
    const entry = registry.find((setting) => setting.id === 'defaultStatefulWorkspace');

    it('shows the setting when stateful code sessions are available', () => {
      expect(entry?.show?.({ ...settingsContext, hasStatefulCodeSessions: true })).toBe(true);
    });

    it('hides the setting when stateful code sessions are unavailable', () => {
      expect(entry?.show?.({ ...settingsContext, hasStatefulCodeSessions: false })).toBe(false);
    });
  });
});
