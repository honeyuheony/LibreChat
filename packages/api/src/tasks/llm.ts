import { EModelEndpoint } from 'librechat-data-provider';
import { Providers, initializeModel } from '@librechat/agents';
import type { ClientOptions } from '@librechat/agents';
import type { IUser } from '@librechat/data-schemas';
import type { EndpointDbMethods, ServerRequest } from '~/types';
import { getProviderConfig } from '~/endpoints/config/providers';
import { resolveRequestTenantId } from '~/middleware/tenant';
import { resolveConfigHeaders } from '~/utils/headers';
import { omitTitleOptions } from '~/agents/client';
import { createSafeUser } from '~/utils/env';

/** The single call shape the task processors need: prompt in, text out. */
export interface TaskLLM {
  model: string;
  invoke(prompt: string, signal?: AbortSignal): Promise<string>;
}

export interface TaskAgentModel {
  endpoint?: string;
  provider?: string;
  model?: string;
  model_parameters?: { model?: string };
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        const text = (part as { text?: unknown })?.text;
        return typeof text === 'string' ? text : '';
      })
      .join('');
  }
  return '';
}

/**
 * Builds a non-streaming model on the conversation agent's endpoint and model, resolved the
 * same way `titleConvo` resolves credentials, so per-document calls reach the same backend.
 */
export async function createTaskLLM({
  req,
  agent,
  db,
  conversationId,
}: {
  req: ServerRequest;
  agent: TaskAgentModel;
  db: EndpointDbMethods;
  conversationId?: string;
}): Promise<TaskLLM> {
  const endpoint = agent.endpoint ?? agent.provider ?? '';
  const model = agent.model_parameters?.model ?? agent.model;
  if (!endpoint || !model) {
    throw new Error('The agent has no endpoint or model to run document tasks with.');
  }
  const providerConfig = getProviderConfig({ provider: endpoint, appConfig: req.config });
  const options = await providerConfig.getOptions({
    req,
    endpoint,
    model_parameters: { model },
    db,
  });
  const llmConfig = { ...(options.llmConfig ?? {}) } as Record<string, unknown> & {
    azureOpenAIApiInstanceName?: string;
    clientOptions?: unknown;
  };
  let provider = (options.provider ??
    providerConfig.overrideProvider ??
    agent.provider) as Providers;
  if (endpoint === EModelEndpoint.azureOpenAI) {
    provider = llmConfig.azureOpenAIApiInstanceName == null ? Providers.OPENAI : Providers.AZURE;
  }
  const anthropicCarrier = llmConfig.clientOptions;
  const clientOptions: Record<string, unknown> = Object.fromEntries(
    Object.entries(llmConfig).filter(([key]) => !omitTitleOptions.has(key)),
  );
  if (anthropicCarrier != null) {
    clientOptions.clientOptions = anthropicCarrier;
  }
  if (options.configOptions) {
    clientOptions.configuration = options.configOptions;
  }
  resolveConfigHeaders({
    llmConfig: clientOptions,
    user: createSafeUser(req.user as IUser | undefined),
    tenantId: resolveRequestTenantId(req),
    body: { conversationId },
  });
  const chatModel = initializeModel({
    provider,
    clientOptions: { ...clientOptions, streaming: false } as ClientOptions,
  }) as { invoke: (input: string, config?: object) => Promise<{ content?: unknown }> };

  return {
    model,
    async invoke(prompt, signal) {
      const response = await chatModel.invoke(prompt, { signal });
      return contentToText(response?.content);
    },
  };
}

/** Pulls the first JSON object out of a model reply, tolerating code fences and prose. */
export function parseJsonObject(reply: string): Record<string, unknown> | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(reply.slice(start, end + 1));
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** One retry on unparseable JSON; a second failure is thrown to the per-document runner. */
export async function invokeJson(
  llm: TaskLLM,
  prompt: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = parseJsonObject(await llm.invoke(prompt, signal));
    if (parsed) {
      return parsed;
    }
  }
  throw new Error('The model did not return a JSON object.');
}
