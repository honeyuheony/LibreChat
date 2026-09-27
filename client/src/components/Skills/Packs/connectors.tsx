import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGetSkillQuery } from '~/data-provider';
import { metadataList } from '../builder/state';

type Report = (id: string, connectors: string[]) => void;

/** 목록 응답에는 머리말이 없어서 스킬마다 상세를 읽어 선언한 MCP 서버를 알린다. */
function ConnectorProbe({ id, onLoad }: { id: string; onLoad: Report }) {
  const { data } = useGetSkillQuery(id);
  const joined = data ? metadataList(data, 'connectors').join('\n') : null;
  useEffect(() => {
    if (joined != null) {
      onLoad(id, joined ? joined.split('\n') : []);
    }
  }, [id, joined, onLoad]);
  return null;
}

/** 고른 스킬들이 선언한 MCP 서버의 합집합. `probes` 를 화면 어딘가에 그려야 값이 찬다. */
export default function useSkillConnectors(ids: string[]) {
  const [byId, setById] = useState<Record<string, string[]>>({});
  const report = useCallback<Report>(
    (id, connectors) => setById((prev) => ({ ...prev, [id]: connectors })),
    [],
  );
  const union = useMemo(() => [...new Set(ids.flatMap((id) => byId[id] ?? []))], [ids, byId]);
  const probes = ids.map((id) => <ConnectorProbe key={id} id={id} onLoad={report} />);
  return { union, probes };
}
