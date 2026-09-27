import type { TAgentsMap, TModelSpec } from 'librechat-data-provider';
import type { useLocalize } from '~/hooks';
import type { Endpoint } from '~/common';
import { filterItems, getDisplayValue, getSpecSelectionMessage } from '../utils';

const agentsEndpoint: Endpoint = {
  value: 'agents',
  label: 'My Agents',
  hasModels: true,
  icon: null,
  showMarketplace: true,
  searchAliases: ['agent marketplace', 'marketplace'],
};

const disabledAgentsEndpoint: Endpoint = {
  value: 'agents',
  label: 'My Agents',
  hasModels: false,
  icon: null,
};

describe('model selector utilities', () => {
  it('matches endpoint search aliases', () => {
    const results = filterItems([agentsEndpoint], 'marketplace', undefined, undefined);
    expect(results).toEqual([agentsEndpoint]);
  });

  it('matches localized Marketplace labels', () => {
    const localize = ((key: string) => {
      if (key === 'com_agents_marketplace') {
        return 'Tienda de Agentes';
      }
      if (key === 'com_ui_marketplace') {
        return 'Tienda';
      }
      return key;
    }) as ReturnType<typeof useLocalize>;

    const results = filterItems([agentsEndpoint], 'tienda', undefined, undefined, localize);
    expect(results).toEqual([agentsEndpoint]);
  });

  it('does not match agents when there are no selectable agent options', () => {
    const results = filterItems([disabledAgentsEndpoint], 'my agents', undefined, undefined);
    expect(results).toEqual([]);
  });
});

describe('getDisplayValue', () => {
  const localize = ((key: string) => key) as ReturnType<typeof useLocalize>;
  const agentsMap = {
    agent_work: { id: 'agent_work', name: 'Work Assistant', model: 'gpt-5.6-luna' },
  } as unknown as TAgentsMap;
  const namedAgentsEndpoint: Endpoint = {
    ...agentsEndpoint,
    agentNames: { agent_work: 'Work Assistant' },
  };
  const modelSpecs = [
    {
      name: 'gpt-6-sol',
      label: 'GPT-6 Sol',
      preset: { endpoint: 'agents', agent_id: 'agent_work', model: 'gpt-6-sol' },
    },
  ] as unknown as TModelSpec[];

  it('shows the spec label for a spec that runs an agent', () => {
    const value = getDisplayValue({
      localize,
      agentsMap,
      modelSpecs,
      mappedEndpoints: [namedAgentsEndpoint],
      selectedValues: { endpoint: 'agents', model: 'agent_work', modelSpec: 'gpt-6-sol' },
    });
    expect(value).toBe('GPT-6 Sol');
  });

  it("shows the agent's model instead of the agent name", () => {
    const value = getDisplayValue({
      localize,
      agentsMap,
      modelSpecs,
      mappedEndpoints: [namedAgentsEndpoint],
      selectedValues: { endpoint: 'agents', model: 'agent_work', modelSpec: '' },
    });
    expect(value).toBe('gpt-5.6-luna');
  });

  it('falls back to the select prompt while the agent is not loaded', () => {
    const value = getDisplayValue({
      localize,
      agentsMap: undefined,
      modelSpecs,
      mappedEndpoints: [namedAgentsEndpoint],
      selectedValues: { endpoint: 'agents', model: 'agent_work', modelSpec: '' },
    });
    expect(value).toBe('com_ui_select_model');
  });
});

describe('getSpecSelectionMessage', () => {
  it('joins the spec label and description', () => {
    const spec = {
      name: 'gpt-6-sol',
      label: 'GPT-6 Sol',
      description: '정밀 · 느림',
      preset: { endpoint: 'agents' },
    } as unknown as TModelSpec;
    expect(getSpecSelectionMessage(spec)).toBe('GPT-6 Sol · 정밀 · 느림');
  });

  it('shows the label alone when the spec has no description', () => {
    const spec = { name: 'gpt-6-luna', label: 'GPT-6 Luna', preset: {} } as unknown as TModelSpec;
    expect(getSpecSelectionMessage(spec)).toBe('GPT-6 Luna');
  });
});
