import { useMemo } from 'react';
import { Tools } from 'librechat-data-provider';
import type { TAttachment, UIResource } from 'librechat-data-provider';
import UIResourceRenderer, { isSupportedUIResource } from '~/components/MCPUIResource/Renderer';
import { useOptionalMessagesOperations } from '~/Providers';
import UIResourceCarousel from './UIResourceCarousel';
import { OutputRenderer } from './ToolOutput';
import { handleUIAction } from '~/utils';
import { useLocalize } from '~/hooks';

function isSimpleObject(obj: unknown): obj is Record<string, string | number | boolean | null> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return false;
  }
  const entries = Object.entries(obj);
  if (entries.length === 0 || entries.length > 8) {
    return false;
  }
  return entries.every(
    ([, v]) =>
      v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  );
}

function KeyValueInput({ data }: { data: Record<string, string | number | boolean | null> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-xs">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex items-baseline gap-1.5">
          <span className="text-text-secondary">{key}:</span>
          <span className="break-all text-text-primary">{String(value ?? 'null')}</span>
        </div>
      ))}
    </div>
  );
}

function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.length > 200 ? value.slice(0, 200) + '...' : value;
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  const str = JSON.stringify(value);
  return str.length > 200 ? str.slice(0, 200) + '...' : str;
}

function ComplexInput({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-xs">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex items-baseline gap-1.5">
          <span className="text-text-secondary">{key}:</span>
          <span className="max-w-[300px] overflow-hidden truncate text-text-primary">
            {formatParamValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function InputRenderer({ input }: { input: string }) {
  if (!input || input.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(input);
    if (isSimpleObject(parsed)) {
      return <KeyValueInput data={parsed} />;
    }
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return <ComplexInput data={parsed as Record<string, unknown>} />;
    }
    // Valid JSON but not a plain object (array, string, number, boolean) — render formatted
    return (
      <pre className="whitespace-pre-wrap font-mono text-xs text-text-primary">
        {typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    // Not JSON — render as plain text
    return <pre className="whitespace-pre-wrap font-mono text-xs text-text-primary">{input}</pre>;
  }
}

export default function ToolCallInfo({
  input,
  output,
  attachments,
}: {
  input: string;
  output?: string | null;
  attachments?: TAttachment[];
}) {
  const localize = useLocalize();
  const { ask } = useOptionalMessagesOperations();

  const hasParams = useMemo(() => {
    if (!input || input.trim().length === 0) {
      return false;
    }
    try {
      const parsed = JSON.parse(input);
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.keys(parsed).length > 0;
      }
    } catch {
      // Not JSON
    }
    return input.trim().length > 0;
  }, [input]);

  const uiResources: UIResource[] =
    attachments
      ?.filter((attachment) => attachment.type === Tools.ui_resources)
      .flatMap((attachment) => {
        return attachment[Tools.ui_resources] as UIResource[];
      })
      .filter(isSupportedUIResource) ?? [];

  return (
    <div className="flex w-full flex-col gap-2.5 px-3 py-3">
      {hasParams && (
        <section className="flex flex-col gap-1">
          <p className="text-xs text-text-tertiary">{localize('com_ui_input')}</p>
          <InputRenderer input={input} />
        </section>
      )}
      {output && (
        <section className="flex flex-col gap-1">
          <p className="text-xs text-text-tertiary">{localize('com_ui_result')}</p>
          <OutputRenderer text={output} />
        </section>
      )}
      {uiResources.length > 0 && (
        <>
          {uiResources.length > 1 && <UIResourceCarousel uiResources={uiResources} />}
          {uiResources.length === 1 && (
            <UIResourceRenderer
              resource={uiResources[0]}
              onUIAction={async (result) => handleUIAction(result, ask)}
              htmlProps={{
                autoResizeIframe: { width: true, height: true },
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
