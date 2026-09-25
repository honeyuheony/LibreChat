import { useLocalize } from '~/hooks';

/** Placeholder for the settings "Connectors" tab; the connector list replaces the note below. */
export default function ConnectorsSettings() {
  const localize = useLocalize();
  return (
    <section aria-labelledby="connectors-settings-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h3 id="connectors-settings-heading" className="text-xl font-bold text-text-primary">
          {localize('com_ui_settings_tab_connectors')}
        </h3>
        <p className="max-w-xl text-sm leading-relaxed text-text-secondary">
          {localize('com_ui_connectors_description')}
        </p>
      </div>
      <p className="rounded-theme-surface border border-dashed border-border-medium px-4 py-8 text-center text-sm text-text-tertiary">
        {localize('com_ui_connectors_placeholder')}
      </p>
    </section>
  );
}
