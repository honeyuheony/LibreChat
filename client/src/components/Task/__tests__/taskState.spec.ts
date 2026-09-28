import fs from 'fs';
import path from 'path';
import { ContentTypes, TaskTools } from 'librechat-data-provider';
import type { TMessage, TaskToolName } from 'librechat-data-provider';
import {
  collectConversationFiles,
  collectTaskOutputs,
  findLatestTaskToolCall,
  resolveTaskSteps,
} from '../taskState';
import { TASK_STAGES } from '~/components/Chat/Messages/Content/Task/stages';

const toolCallMessage = (
  toolCall: Record<string, unknown>,
  extra: Partial<TMessage> = {},
): TMessage =>
  ({
    messageId: `m-${String(toolCall.id)}`,
    isCreatedByUser: false,
    content: [{ type: ContentTypes.TOOL_CALL, tool_call: toolCall }],
    ...extra,
  }) as unknown as TMessage;

describe('findLatestTaskToolCall', () => {
  it('ignores other tools and follows the last task tool call', () => {
    const messages = [
      toolCallMessage({ id: 'a', name: 'extract_table', args: '{}', output: 'done' }),
      toolCallMessage({ id: 'b', name: 'file_search', args: '{}' }),
      toolCallMessage({ id: 'c', name: 'summarize_documents', args: '{}' }),
    ];
    expect(findLatestTaskToolCall(messages)).toEqual({
      toolCallId: 'c',
      name: 'summarize_documents',
      awaitingApproval: false,
      finished: false,
      hasResult: false,
      hadApproval: false,
    });
  });

  it('knows whether the finished call saved a result', () => {
    const approval = { actionId: 'x', allowed_decisions: ['approve'] };
    const rejected = [
      toolCallMessage({ id: 'a', name: 'extract_table', approval, output: '거절되었습니다' }),
    ];
    expect(findLatestTaskToolCall(rejected)).toMatchObject({
      finished: true,
      hasResult: false,
      hadApproval: true,
    });

    const saved = [
      toolCallMessage({ id: 'a', name: 'extract_table', output: 'done' }, {
        attachments: [
          {
            type: 'task_result',
            toolCallId: 'a',
            task_result: { resultId: 'r1', kind: 'table', title: 't', stats: {} },
          },
        ],
      } as unknown as Partial<TMessage>),
    ];
    expect(findLatestTaskToolCall(saved)).toMatchObject({ finished: true, hasResult: true });
  });

  it('reports a pending approval until the call has output', () => {
    const approval = { actionId: 'x', allowed_decisions: ['approve'] };
    expect(
      findLatestTaskToolCall([toolCallMessage({ id: 'a', name: 'extract_table', approval })])
        ?.awaitingApproval,
    ).toBe(true);
    expect(
      findLatestTaskToolCall([
        toolCallMessage({ id: 'a', name: 'extract_table', approval, output: 'ok' }),
      ])?.awaitingApproval,
    ).toBe(false);
  });

  /** 끝난 호출에는 `approval` 이 남지 않아, 다시 불러오면 SDK 가 실행 대신 준 답만 남는다. */
  it('knows a saved call was stopped at its confirmation from the blocked answer', () => {
    const call = findLatestTaskToolCall([
      toolCallMessage({
        id: 'a',
        name: 'summarize_documents',
        output: 'Blocked: Rejected by user',
      }),
    ]);
    expect(call).toMatchObject({ finished: true, hasResult: false, hadApproval: true });
    expect(resolveTaskSteps(call!, null).map((step) => step.state)).toEqual([
      'done',
      'stopped',
      'todo',
      'todo',
      'todo',
    ]);
  });

  it('returns null when the conversation never called a task tool', () => {
    expect(findLatestTaskToolCall([toolCallMessage({ id: 'a', name: 'web_search' })])).toBeNull();
    expect(findLatestTaskToolCall(undefined)).toBeNull();
  });
});

describe('resolveTaskSteps', () => {
  const call = {
    toolCallId: 't',
    name: TaskTools.extract_table,
    awaitingApproval: false,
    finished: false,
    hasResult: false,
    hadApproval: false,
  };

  /** 이 테스트에서 위로 올라가며 `packages/api` 가 든 저장소 루트를 찾는다. */
  const serverToolsSource = () => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'packages', 'api'))) {
      const parent = path.dirname(dir);
      if (parent === dir) {
        throw new Error('packages/api not found above the test');
      }
      dir = parent;
    }
    return fs.readFileSync(path.join(dir, 'packages', 'api', 'src', 'tasks', 'tools.ts'), 'utf8');
  };

  /** 서버 소스의 `TASK_STAGES` 에 적힌 도구별 단계 id. */
  const serverStageIds = (source: string, tool: string) => {
    const block = source.match(new RegExp(`\\[TaskTools\\.${tool}\\]: \\[([^\\]]*)\\]`));
    return [...(block?.[1] ?? '').matchAll(/id: '([^']+)'/g)].map((match) => match[1]);
  };

  it('uses the stage ids the server sends for every task tool', () => {
    const source = serverToolsSource();
    const expectedStageCounts: Record<TaskToolName, number> = {
      [TaskTools.extract_table]: 5,
      [TaskTools.summarize_documents]: 5,
      [TaskTools.write_report]: 5,
      [TaskTools.fill_report_template]: 3,
    };
    for (const tool of Object.values(TaskTools)) {
      const ids = serverStageIds(source, tool);
      expect(ids).toHaveLength(expectedStageCounts[tool]);
      expect(TASK_STAGES[tool].map((stage) => stage.id)).toEqual(ids);
    }
  });

  it('puts the step named by the progress event in front', () => {
    const steps = resolveTaskSteps(call, {
      toolCallId: 't',
      stage: 'extract',
      done: 5,
      total: 12,
      label: '전체 문서에서 항목 추출',
    });
    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'now', 'todo', 'todo']);
  });

  it('holds on the confirmation step while approval is pending', () => {
    const steps = resolveTaskSteps({ ...call, awaitingApproval: true }, null);
    expect(steps.map((step) => step.state)).toEqual(['done', 'now', 'todo', 'todo', 'todo']);
  });

  it('marks every step done once the call has finished with a saved result', () => {
    const steps = resolveTaskSteps({ ...call, finished: true, hasResult: true }, null);
    expect(steps.every((step) => step.state === 'done')).toBe(true);
  });

  it('stops on the confirmation step when a confirmed call ended without a result', () => {
    const steps = resolveTaskSteps({ ...call, finished: true, hadApproval: true }, null);
    expect(steps.map((step) => step.state)).toEqual(['done', 'stopped', 'todo', 'todo', 'todo']);
  });

  it('stops on the last reported step when the call failed midway', () => {
    const steps = resolveTaskSteps(
      { ...call, finished: true, hadApproval: true },
      { toolCallId: 't', stage: 'extract', done: 3, total: 12, label: '' },
    );
    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'stopped', 'todo', 'todo']);
  });

  it('stops on the first step when a call without confirmation returned nothing', () => {
    const steps = resolveTaskSteps({ ...call, name: TaskTools.write_report, finished: true }, null);
    expect(steps.map((step) => step.state)).toEqual(['stopped', 'todo', 'todo', 'todo', 'todo']);
  });

  it('starts on the first step before any event and on unknown stage ids', () => {
    expect(resolveTaskSteps(call, null)[0].state).toBe('now');
    const steps = resolveTaskSteps(call, {
      toolCallId: 't',
      stage: 'unknown',
      done: 0,
      total: 1,
      label: '',
    });
    expect(steps[0].state).toBe('now');
  });
});

describe('collectTaskOutputs', () => {
  it('reads flat and nested task_result attachments once each, oldest first', () => {
    const messages = [
      {
        messageId: 'm1',
        createdAt: '2026-09-26T09:03:00',
        attachments: [
          { type: 'file_search', file_search: {} },
          {
            type: 'task_result',
            resultId: 'r1',
            kind: 'table',
            title: '분야별 비교표',
            stats: { docs: 12, none: 3 },
          },
        ],
      },
      {
        messageId: 'm2',
        attachments: [
          {
            type: 'task_result',
            task_result: {
              resultId: 'r2',
              kind: 'report',
              title: '부처 표준 보고서 초안.hwp',
              stats: { reflected: 12 },
              createdAt: '2026-09-26T10:00:00',
            },
          },
          { type: 'task_result', resultId: 'r1', kind: 'table', title: 'dup' },
          { type: 'task_result', resultId: 'r3', kind: 'nonsense' },
        ],
      },
    ] as unknown as TMessage[];

    expect(collectTaskOutputs(messages)).toEqual([
      {
        resultId: 'r1',
        kind: 'table',
        title: '분야별 비교표',
        stats: { docs: 12, none: 3 },
        createdAt: '2026-09-26T09:03:00',
      },
      {
        resultId: 'r2',
        kind: 'report',
        title: '부처 표준 보고서 초안.hwp',
        stats: { reflected: 12 },
        createdAt: '2026-09-26T10:00:00',
      },
    ]);
  });
});

describe('collectConversationFiles', () => {
  it('lists each attached file once', () => {
    const messages = [
      { messageId: 'u1', files: [{ file_id: 'f1', filename: 'a.hwp' }] },
      {
        messageId: 'u2',
        files: [
          { file_id: 'f1', filename: 'a.hwp' },
          { file_id: 'f2', filename: 'b.pdf' },
        ],
      },
    ] as unknown as TMessage[];
    expect(collectConversationFiles(messages)).toEqual([
      { file_id: 'f1', filename: 'a.hwp' },
      { file_id: 'f2', filename: 'b.pdf' },
    ]);
  });
});
