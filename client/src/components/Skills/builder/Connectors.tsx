import { useState } from 'react';
import type { BuilderState, ChangedField } from './state';
import type { PreviewBlock } from './Blocks';
import SourceTag, { ChangedMark } from './SourceTag';
import { Block, NO_CHOICES } from './Blocks';
import { useLocalize } from '~/hooks';

/** 「읽는 자료」: 켠 MCP 서버와 추천 서버, 펼치면 쓸 수 있는 서버 전체를 켜고 끈다. */
export default function ConnectorsBlock({
  state,
  changed,
  active,
  onActivate,
  onToggleConnector,
  connectorChoices,
}: {
  state: BuilderState;
  changed: ReadonlySet<ChangedField>;
  active: boolean;
  onActivate: (block: PreviewBlock) => void;
  onToggleConnector: (name: string) => void;
  connectorChoices: string[];
}) {
  const localize = useLocalize();
  const [allConnectors, setAllConnectors] = useState(false);
  const { values, sources } = state;
  const connectors = [
    ...new Set([
      ...values.connectors,
      ...state.recommended,
      ...(allConnectors ? connectorChoices : NO_CHOICES),
    ]),
  ];
  return (
    <Block
      active={active}
      title={
        <>
          {localize('com_skills_builder_data')}
          <SourceTag source={sources.connectors} />
          <ChangedMark show={changed.has('connectors')} />
        </>
      }
    >
      <ul className="ms-5 list-disc text-sm text-text-primary">
        {/* 초안은 채팅에 적은 글로 쓰고, 나머지 결과물은 실행할 때 올린 문서를 읽는다. */}
        <li>
          {localize(
            values.output === 'draft'
              ? 'com_skills_builder_data_chat'
              : 'com_skills_builder_data_files',
          )}
        </li>
      </ul>
      {connectors.length > 0 && (
        <div className="mt-2 flex flex-col">
          {connectors.map((name) => {
            const on = values.connectors.includes(name);
            return (
              <label
                key={name}
                className="flex items-center gap-2 border border-b-0 border-border-light bg-surface-primary px-2.5 py-1.5 text-sm first:rounded-t-lg last:rounded-b-lg last:border-b"
              >
                <span className="flex-1">{name}</span>
                {!on && state.recommended.includes(name) && (
                  <span className="rounded-full border border-border-brand px-1.5 text-xs">
                    {localize('com_skills_builder_ai_recommended')}
                  </span>
                )}
                <input
                  type="checkbox"
                  role="switch"
                  aria-checked={on}
                  checked={on}
                  onChange={() => onToggleConnector(name)}
                />
              </label>
            );
          })}
        </div>
      )}
      <p className="mt-1.5 text-xs text-text-secondary">
        {localize(
          values.connectors.length > 0
            ? 'com_skills_builder_connectors_on'
            : 'com_skills_builder_connectors_off',
        )}{' '}
        <button
          type="button"
          aria-expanded={allConnectors}
          onClick={() => {
            setAllConnectors(!allConnectors);
            onActivate('data');
          }}
          className="underline hover:text-text-primary"
        >
          {localize(
            allConnectors
              ? 'com_skills_builder_connectors_less'
              : 'com_skills_builder_connectors_more',
          )}
        </button>
      </p>
    </Block>
  );
}
