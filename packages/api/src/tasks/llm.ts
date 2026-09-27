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

/** 작업 처리기는 모델을 이 형태로만 부른다. prompt 를 넣으면 text 가 나온다. */
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
 * 대화 agent 의 endpoint 와 모델로 스트리밍하지 않는 모델을 만든다. 인증 정보를 `titleConvo` 와
 * 같은 방식으로 풀어서, 문서별 호출도 대화와 같은 backend 로 간다.
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

/** 모델 답에서 첫 JSON 객체를 뽑는다. code fence 나 설명 글이 섞여 있어도 읽는다. */
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

/** JSON 을 읽지 못하면 한 번만 다시 부르고, 또 실패하면 `runPerDocument` 쪽으로 오류를 던진다. */
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
