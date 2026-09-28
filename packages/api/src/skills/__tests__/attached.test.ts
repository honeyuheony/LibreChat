import { Types } from 'mongoose';
import { Readable } from 'stream';
import { Constants } from '@librechat/agents';
import type {
  ToolCallRequest,
  ToolExecuteResult,
  ToolExecuteBatchRequest,
} from '@librechat/agents';
import type { ToolExecuteOptions } from '~/agents/handlers';
import { createToolExecuteHandler } from '~/agents/handlers';

const SKILL_ID = new Types.ObjectId();
const SAMPLE = '3월 파리 출장\n목적: 박람회 참관\n경비: 1,240유로';

/** 편집기가 올린 예시 문서. 올린 직후라 본문 캐시가 없어 저장소에서 읽는다. */
function uploadedSample() {
  return {
    relativePath: 'examples/doc.txt',
    filename: '지난 출장.txt',
    filepath: '/uploads/u1/f1__지난 출장.txt',
    source: 'local',
    mimeType: 'text/plain',
    bytes: Buffer.byteLength(SAMPLE),
  };
}

function runReadFile(configurable: Record<string, unknown>) {
  const getSkillByName = jest.fn(async () => ({
    _id: SKILL_ID,
    name: 'trip-report',
    body: '# 출장보고\n\n- 예시 문서: skills/trip-report/examples/doc.txt (지난 출장.txt)',
    fileCount: 1,
    version: 3,
  }));
  const getSkillFileByPath = jest.fn(async () => uploadedSample());
  const getDownloadStream = jest.fn(async () => Readable.from([Buffer.from(SAMPLE)]));
  const handler = createToolExecuteHandler({
    loadTools: jest.fn(async () => ({
      loadedTools: [],
      configurable: { req: { user: { id: 'u2' } }, ...configurable },
    })),
    getSkillByName,
    getSkillFileByPath,
    getStrategyFunctions: (() => ({
      getDownloadStream,
    })) as ToolExecuteOptions['getStrategyFunctions'],
  } as ToolExecuteOptions);
  const toolCall: ToolCallRequest = {
    id: 'call_read_sample',
    name: Constants.READ_FILE,
    args: { path: 'skills/trip-report/examples/doc.txt' },
  };
  const result = new Promise<ToolExecuteResult[]>((resolve, reject) => {
    const request: ToolExecuteBatchRequest = { toolCalls: [toolCall], resolve, reject };
    handler.handle('on_tool_execute', request);
  });
  return { result, getSkillFileByPath, getDownloadStream };
}

describe('documents attached in the agent editor', () => {
  it('reach the model in a test run that picks the skill by hand', async () => {
    const { result, getSkillFileByPath } = runReadFile({
      accessibleSkillIds: [SKILL_ID],
      skillPrimedIdsByName: { 'trip-report': SKILL_ID.toString() },
    });
    const [read] = await result;

    expect(getSkillFileByPath).toHaveBeenCalledWith(SKILL_ID, 'examples/doc.txt');
    expect(read.status).toBe('success');
    expect(read.content).toContain('목적: 박람회 참관');
    expect(read.content).toContain('경비: 1,240유로');
  });

  it('reach the model when someone the agent is shared with runs the published agent', async () => {
    const { result, getDownloadStream } = runReadFile({ accessibleSkillIds: [SKILL_ID] });
    const [read] = await result;

    expect(getDownloadStream).toHaveBeenCalledTimes(1);
    expect(read.status).toBe('success');
    expect(read.content).toContain('3월 파리 출장');
  });

  it('stay out of reach for a person the published agent is not shared with', async () => {
    const { result, getSkillFileByPath } = runReadFile({ accessibleSkillIds: [] });
    const [read] = await result;

    expect(getSkillFileByPath).not.toHaveBeenCalled();
    expect(read.content ?? '').not.toContain('박람회');
  });
});
