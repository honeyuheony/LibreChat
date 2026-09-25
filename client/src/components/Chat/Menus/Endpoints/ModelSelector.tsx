import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { getConfigDefaults } from 'librechat-data-provider';
import type { ModelSelectorProps } from '~/common';
import {
  renderModelSpecs,
  renderEndpoints,
  renderSearchResults,
  renderCustomGroups,
} from './components';
import { ModelSelectorProvider, useModelSelectorContext } from './ModelSelectorContext';
import { useShortcutAriaKey, useShortcutHint } from '~/hooks/useKeyboardShortcuts';
import { ModelSelectorChatProvider } from './ModelSelectorChatContext';
import { CustomMenu as Menu } from './CustomMenu';
import DialogManager from './DialogManager';
import { getDisplayValue } from './utils';
import { useLocalize } from '~/hooks';

const defaultInterface = getConfigDefaults().interface;

function ModelSelectorContent() {
  const localize = useLocalize();
  const modelSelectorHint = useShortcutHint('openModelSelector', localize('com_ui_select_model'));
  const modelSelectorAriaKey = useShortcutAriaKey('openModelSelector');

  const {
    // LibreChat
    agentsMap,
    modelSpecs,
    mappedEndpoints,
    endpointsConfig,
    // State
    searchValue,
    searchResults,
    selectedValues,
    // Functions
    setSearchValue,
    setSelectedValues,
    // Dialog
    keyDialogOpen,
    onOpenChange,
    keyDialogEndpoint,
  } = useModelSelectorContext();

  const selectedDisplayValue = useMemo(
    () =>
      getDisplayValue({
        localize,
        agentsMap,
        modelSpecs,
        selectedValues,
        mappedEndpoints,
      }),
    [localize, agentsMap, modelSpecs, selectedValues, mappedEndpoints],
  );

  /* Sits in the composer's action row beside Send, naming the agent in plain text. */
  const trigger = (
    <TooltipAnchor
      aria-label={localize('com_ui_select_model')}
      description={modelSelectorHint}
      render={
        <button
          type="button"
          data-testid="model-selector-button"
          aria-keyshortcuts={modelSelectorAriaKey}
          className="flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-theme-control px-2.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          aria-label={`${localize('com_ui_select_model')}: ${selectedDisplayValue}`}
        >
          <span className="truncate text-left">{selectedDisplayValue}</span>
          <ChevronDown className="size-4 flex-shrink-0" aria-hidden="true" />
        </button>
      }
    />
  );

  return (
    <div className="relative flex min-w-0 max-w-[40%] items-center sm:max-w-[240px]">
      <Menu
        placement="top-end"
        className="h-9 w-auto border-0 bg-transparent px-0 py-0 hover:bg-transparent"
        values={selectedValues}
        onValuesChange={(values: Record<string, any>) => {
          setSelectedValues({
            endpoint: values.endpoint || '',
            model: values.model || '',
            modelSpec: values.modelSpec || '',
          });
        }}
        onSearch={(value) => setSearchValue(value)}
        combobox={<input id="model-search" placeholder=" " />}
        comboboxLabel={localize('com_endpoint_search_models')}
        trigger={trigger}
      >
        {searchResults ? (
          renderSearchResults(searchResults, localize, searchValue)
        ) : (
          <>
            {/* Render ungrouped modelSpecs (no group field) */}
            {renderModelSpecs(
              modelSpecs?.filter((spec) => !spec.group) || [],
              selectedValues.modelSpec || '',
            )}
            {/* Render endpoints (will include grouped specs matching endpoint names) */}
            {renderEndpoints(mappedEndpoints ?? [])}
            {/* Render custom groups (specs with group field not matching any endpoint) */}
            {renderCustomGroups(modelSpecs || [], mappedEndpoints ?? [])}
          </>
        )}
      </Menu>
      <DialogManager
        keyDialogOpen={keyDialogOpen}
        onOpenChange={onOpenChange}
        endpointsConfig={endpointsConfig || {}}
        keyDialogEndpoint={keyDialogEndpoint || undefined}
      />
    </div>
  );
}

export default function ModelSelector({ startupConfig }: ModelSelectorProps) {
  const interfaceConfig = startupConfig?.interface ?? defaultInterface;
  const modelSpecs = startupConfig?.modelSpecs?.list ?? [];

  // Hide the selector when modelSelect is false and there are no model specs to show
  if (interfaceConfig.modelSelect === false && modelSpecs.length === 0) {
    return null;
  }

  return (
    <ModelSelectorChatProvider>
      <ModelSelectorProvider startupConfig={startupConfig}>
        <ModelSelectorContent />
      </ModelSelectorProvider>
    </ModelSelectorChatProvider>
  );
}
