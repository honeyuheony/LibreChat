import { Types } from 'mongoose';
import { Readable } from 'stream';
import { logger } from '@librechat/data-schemas';
import type { TaskResult } from 'librechat-data-provider';
import type { LCTool } from '@librechat/agents';
import type { ReportTemplateFile, SkillTemplateSource } from './fill';
import type { TaskResultArtifact } from './tools';
import {
  reportTemplatesFor,
  findReportTemplates,
  buildReportTemplateDefinition,
  attachReportTemplateTool,
  FILL_REPORT_TEMPLATE_TOOL,
  createSkillTemplateSource,
  createFillReportTemplateTool,
} from './fill';
import { resolveManualSkills } from '~/agents/skills';
import { createHwpService } from './hwpService';

const SKILL_ID = new Types.ObjectId();
const TEMPLATE = Buffer.from('PK\u0003\u0004출장보고 양식');
const FILLED = Buffer.from('PK\u0003\u0004채운 보고서');

type Call = { url: string; body: Record<string, unknown> };

/** hwp-mcp 대역: fields 는 정해 둔 항목을, fill 은 채운 바이트를 돌려준다. */
function fakeHwp(fields: string[] = ['출장 목적', '출장 기간'], fillResponse?: Response) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    if (url.endsWith('/template/fields')) {
      return new Response(JSON.stringify({ fields }), { status: 200 });
    }
    return (
      fillResponse ??
      new Response(FILLED, {
        status: 200,
        headers: {
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('출장보고 양식.hwpx')}`,
        },
      })
    );
  }) as unknown as typeof fetch;
  return { hwp: createHwpService({ baseUrl: 'http://hwp', fetchImpl }), calls };
}

function skillFiles(): SkillTemplateSource {
  const files = [
    { relativePath: 'assets/doc.hwpx', filename: '출장보고 양식.hwpx' },
    { relativePath: 'assets/old.hwp', filename: '예전 양식.hwp' },
    { relativePath: 'examples/doc.txt', filename: '지난 출장.txt' },
  ];
  return {
    listSkillFiles: jest.fn(async () => files),
    readSkillFile: jest.fn(async () => TEMPLATE),
  };
}

const skill = { _id: SKILL_ID, name: 'trip-report', version: 3 };

describe('findReportTemplates', () => {
  it('reads only the .hwpx templates in assets and keeps their fields', async () => {
    const { hwp, calls } = fakeHwp();
    const source = skillFiles();
    const templates = await findReportTemplates([skill], { ...source, hwp });

    expect(source.readSkillFile).toHaveBeenCalledTimes(1);
    expect(source.readSkillFile).toHaveBeenCalledWith(SKILL_ID, 'assets/doc.hwpx');
    expect(calls).toEqual([
      { url: 'http://hwp/template/fields', body: { template_b64: TEMPLATE.toString('base64') } },
    ]);
    expect(templates).toEqual([
      {
        name: '출장보고 양식.hwpx',
        skillName: 'trip-report',
        relativePath: 'assets/doc.hwpx',
        fields: ['출장 목적', '출장 기간'],
        buffer: TEMPLATE,
      },
    ]);
  });

  it('describes field names without using them as schema property keys', () => {
    const definition = buildReportTemplateDefinition([
      {
        name: '출장보고 양식.hwpx',
        skillName: 'trip-report',
        relativePath: 'assets/doc.hwpx',
        fields: ['출장 목적'],
        buffer: TEMPLATE,
      },
    ]);

    expect(definition.description).toContain('출장 목적');
    expect(definition.parameters).toMatchObject({
      properties: {
        values: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
      },
    });
    expect(definition.parameters).not.toMatchObject({
      properties: { values: { properties: expect.anything() } },
    });
  });

  it('rejects formatting controls, tag characters, and schema punctuation in fields', async () => {
    const unsafeFields = [
      '방향‮제어',
      '제로​폭',
      'BOM﻿',
      `태그${String.fromCodePoint(0xe0001)}`,
      '쉼표,항목',
      '콜론:항목',
      '중괄호{항목}',
      '큰"따옴표',
      "작은'따옴표",
    ];
    const { hwp } = fakeHwp([...unsafeFields, '허용 항목']);
    const [template] = await findReportTemplates([skill], { ...skillFiles(), hwp });

    expect(template.fields).toEqual(['허용 항목']);
  });

  it('omits filenames with schema punctuation and warns', async () => {
    const source = skillFiles();
    source.listSkillFiles = async () => [
      { relativePath: 'assets/doc.hwpx', filename: 'unsafe,name.hwpx' },
    ];
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    try {
      const { hwp } = fakeHwp();
      expect(await findReportTemplates([skill], { ...source, hwp })).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        '[fill_report_template] Skipping a report template with an unsafe filename',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('also rejects an unsafe skill prefix in a disambiguated filename', async () => {
    const skills = [
      { ...skill, _id: 'safe-skill', name: 'safe-skill' },
      { ...skill, _id: 'unsafe-skill', name: 'unsafe:skill' },
    ];
    const source = {
      listSkillFiles: async () => [{ relativePath: 'assets/shared.hwpx', filename: 'shared.hwpx' }],
      readSkillFile: async () => TEMPLATE,
    };
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    try {
      const { hwp } = fakeHwp();
      const templates = await findReportTemplates(skills, { ...source, hwp });

      expect(templates.map((template) => template.name)).toEqual(['safe-skill/shared.hwpx']);
      expect(warn).toHaveBeenCalledWith(
        '[fill_report_template] Skipping a report template with an unsafe name',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('filters invalid fields before keeping the first 100 and reports every discarded field', async () => {
    const overlong = '가'.repeat(201);
    const newline = '줄\n바꿈';
    const control = '제어\u0001문자';
    const boundary = '가'.repeat(200);
    const remaining = Array.from({ length: 100 }, (_, index) => `항목${index + 1}`);
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    try {
      const { hwp } = fakeHwp([overlong, newline, control, boundary, ...remaining]);
      const [template] = await findReportTemplates([skill], { ...skillFiles(), hwp });
      const definition = buildReportTemplateDefinition([template]);

      expect(template.fields).toEqual([boundary, ...remaining.slice(0, 99)]);
      expect(definition.description).not.toContain(overlong);
      expect(definition.description).not.toContain(newline);
      expect(definition.description).not.toContain(control);
      expect(definition.description).toContain('항목99');
      expect(definition.description).not.toContain('항목100');
      expect(JSON.stringify(definition.parameters)).not.toContain(overlong);
      expect(JSON.stringify(definition.parameters)).not.toContain(newline);
      expect(JSON.stringify(definition.parameters)).not.toContain(control);
      expect(warn).toHaveBeenCalledWith(
        '[fill_report_template] Skipped 4 invalid or excess fields',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('limits field lookup to five seconds', async () => {
    const timeoutSignal = AbortSignal.abort();
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutSignal);
    const fields = jest.fn(async (_buffer: Buffer, _signal?: AbortSignal) => ({
      ok: true as const,
      fields: ['출장 목적'],
    }));

    try {
      await findReportTemplates([skill], { ...skillFiles(), hwp: { fields } });
      expect(timeout).toHaveBeenCalledWith(5_000);
      expect(fields).toHaveBeenCalledWith(TEMPLATE, timeoutSignal);
    } finally {
      timeout.mockRestore();
    }
  });

  it('leaves out a template that has no {{field}} marks', async () => {
    const { hwp } = fakeHwp([]);
    expect(await findReportTemplates([skill], { ...skillFiles(), hwp })).toEqual([]);
  });

  it('asks for the fields of the same skill version only once', async () => {
    const { hwp, calls } = fakeHwp();
    const fieldCache = new Map<string, string[]>();
    await findReportTemplates([skill], { ...skillFiles(), hwp, fieldCache });
    await findReportTemplates([skill], { ...skillFiles(), hwp, fieldCache });
    expect(calls).toHaveLength(1);

    await findReportTemplates([{ ...skill, version: 4 }], { ...skillFiles(), hwp, fieldCache });
    expect(calls).toHaveLength(2);
  });

  it('caches connection, 5xx, and busy failures for ten seconds', async () => {
    const time = jest.spyOn(Date, 'now');
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    try {
      for (const failure of ['connection', 'server', 'busy']) {
        let requests = 0;
        const fetchImpl = (async () => {
          requests += 1;
          if (requests > 1) {
            return new Response(JSON.stringify({ fields: ['출장 목적'] }), { status: 200 });
          }
          if (failure === 'connection') {
            throw new Error('ECONNREFUSED');
          }
          return new Response(
            JSON.stringify({
              error: failure === 'busy' ? 'busy' : 'render_failed',
              message: 'temporary failure',
            }),
            { status: failure === 'busy' ? 429 : 503 },
          );
        }) as unknown as typeof fetch;
        const failingSkill = { ...skill, _id: `field-transient-${failure}` };
        const deps = {
          ...skillFiles(),
          hwp: createHwpService({ baseUrl: 'http://hwp', fetchImpl }),
        };

        time.mockReturnValue(1_000);
        expect(await findReportTemplates([failingSkill], deps)).toEqual([]);
        time.mockReturnValue(10_999);
        expect(await findReportTemplates([failingSkill], deps)).toEqual([]);
        expect(requests).toBe(1);

        time.mockReturnValue(11_000);
        expect(await findReportTemplates([failingSkill], deps)).toHaveLength(1);
        expect(requests).toBe(2);
      }
    } finally {
      time.mockRestore();
      warn.mockRestore();
    }
  });

  it('caches an invalid template response for sixty seconds', async () => {
    let requests = 0;
    const fetchImpl = (async () => {
      requests += 1;
      if (requests === 1) {
        return new Response(JSON.stringify({ error: 'invalid_request', message: 'not hwpx' }), {
          status: 422,
        });
      }
      return new Response(JSON.stringify({ fields: ['출장 목적'] }), { status: 200 });
    }) as unknown as typeof fetch;
    const failingSkill = { ...skill, _id: 'field-failure-invalid-template' };
    const deps = { ...skillFiles(), hwp: createHwpService({ baseUrl: 'http://hwp', fetchImpl }) };
    const time = jest.spyOn(Date, 'now');

    try {
      time.mockReturnValue(1_000);
      expect(await findReportTemplates([failingSkill], deps)).toEqual([]);
      time.mockReturnValue(60_999);
      expect(await findReportTemplates([failingSkill], deps)).toEqual([]);
      expect(requests).toBe(1);

      time.mockReturnValue(61_000);
      expect(await findReportTemplates([failingSkill], deps)).toHaveLength(1);
      expect(requests).toBe(2);
    } finally {
      time.mockRestore();
    }
  });

  it('queries at most five templates during one turn', async () => {
    const files = Array.from({ length: 6 }, (_, index) => ({
      relativePath: `assets/template-${index + 1}.hwpx`,
      filename: `template-${index + 1}.hwpx`,
    }));
    const listSkillFiles = jest.fn(async () => files);
    const readSkillFile = jest.fn(async () => TEMPLATE);
    const fields = jest.fn(async () => ({ ok: true as const, fields: ['항목'] }));
    const templates = await findReportTemplates([skill], {
      listSkillFiles,
      readSkillFile,
      hwp: { fields },
      maxTemplatesPerTurn: 100,
    });

    expect(templates).toHaveLength(5);
    expect(readSkillFile).toHaveBeenCalledTimes(5);
    expect(fields).toHaveBeenCalledTimes(5);
  });

  it('keeps the failed field cache within the successful cache limit', async () => {
    const fields = jest.fn(async () => ({
      ok: false as const,
      code: 'unavailable',
      message: 'connection failed',
    }));
    const deps = { ...skillFiles(), hwp: { fields } };
    const skills = Array.from({ length: 201 }, (_, index) => ({
      _id: `field-failure-cap-${index}`,
      name: 'trip-report',
      version: 1,
    }));

    for (const candidate of skills) {
      await findReportTemplates([candidate], deps);
    }
    await findReportTemplates([skills[200]], deps);
    expect(fields).toHaveBeenCalledTimes(201);

    await findReportTemplates([skills[0]], deps);
    expect(fields).toHaveBeenCalledTimes(202);
  });
});

describe('attachReportTemplateTool', () => {
  function emptyConfig() {
    return { toolDefinitions: [] as LCTool[], toolRegistry: new Map<string, LCTool>() };
  }

  it('turns the tool on with each template and its fields in the description', async () => {
    const { hwp } = fakeHwp();
    const req = {};
    const config = { ...emptyConfig(), manualSkillPrimes: [{ ...skill, body: '# 출장보고' }] };
    await attachReportTemplateTool({ req, config, ...skillFiles(), hwp });

    const [definition] = config.toolDefinitions;
    expect(definition.name).toBe(FILL_REPORT_TEMPLATE_TOOL);
    expect(definition.description).toContain('출장보고 양식.hwpx: 출장 목적, 출장 기간');
    expect(definition.parameters).toMatchObject({
      properties: { template: { enum: ['출장보고 양식.hwpx'] } },
      required: ['template', 'values'],
    });
    expect(config.toolRegistry.get(FILL_REPORT_TEMPLATE_TOOL)).toBe(definition);
    expect(reportTemplatesFor(req).map((template) => template.name)).toEqual([
      '출장보고 양식.hwpx',
    ]);
  });

  it('keeps the tool off when no skill of the turn has a template', async () => {
    const { hwp, calls } = fakeHwp();
    const req = {};
    const config = { ...emptyConfig(), manualSkillPrimes: [] };
    await attachReportTemplateTool({ req, config, ...skillFiles(), hwp });

    expect(config.toolDefinitions).toEqual([]);
    expect(config.toolRegistry.size).toBe(0);
    expect(calls).toEqual([]);
    expect(reportTemplatesFor(req)).toEqual([]);
  });

  it('keeps the tool off for a person the skill is not shared with', async () => {
    const { hwp, calls } = fakeHwp();
    const getSkillByName = jest.fn(async (_name: string, accessibleIds: Types.ObjectId[]) =>
      accessibleIds.some((id) => id.equals(SKILL_ID)) ? { ...skill, body: '# 출장보고' } : null,
    );
    const primes = await resolveManualSkills({
      names: ['trip-report'],
      getSkillByName: getSkillByName as never,
      accessibleSkillIds: [new Types.ObjectId()],
    });
    const config = { ...emptyConfig(), manualSkillPrimes: primes };
    await attachReportTemplateTool({ req: {}, config, ...skillFiles(), hwp });

    expect(primes).toEqual([]);
    expect(config.toolDefinitions).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('keeps the turn going without the tool when hwp-mcp cannot be reached', async () => {
    const fetchImpl = (async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;
    const config = { ...emptyConfig(), manualSkillPrimes: [{ ...skill, body: '# 출장보고' }] };
    await attachReportTemplateTool({
      req: {},
      config,
      ...skillFiles(),
      hwp: createHwpService({ fetchImpl }),
    });
    expect(config.toolDefinitions).toEqual([]);
  });
});

describe('fill_report_template tool', () => {
  const template: ReportTemplateFile = {
    name: '출장보고 양식.hwpx',
    skillName: 'trip-report',
    relativePath: 'assets/doc.hwpx',
    fields: ['출장 목적', '출장 기간'],
    buffer: TEMPLATE,
  };

  function setup(hwpFixture = fakeHwp()) {
    const { hwp, calls } = hwpFixture;
    const files: Array<{ buffer: Buffer; filename: string }> = [];
    const saved: TaskResult[] = [];
    const fillTool = createFillReportTemplateTool({
      templates: [template],
      hwp,
      saveReportFile: async (file) => {
        files.push(file);
        return { file_id: 'file-1', filename: file.filename };
      },
      saveResult: async (result) => {
        saved.push(result);
      },
      createId: () => 'result-1',
      now: () => Date.parse('2026-09-28T00:00:00Z'),
    });
    const invoke = async (args: Record<string, unknown>) =>
      (await fillTool.invoke(
        { id: 'call_1', name: FILL_REPORT_TEMPLATE_TOOL, args, type: 'tool_call' },
        { configurable: { thread_id: 'convo-1' } },
      )) as unknown as { content: string; artifact?: Record<string, TaskResultArtifact> };
    return { invoke, calls, files, saved };
  }

  it('fills the template through /template/fill and saves the result as the user file', async () => {
    const env = setup();
    const message = await env.invoke({
      template: '출장보고 양식.hwpx',
      values: { '출장 목적': '박람회 참관', '출장 기간': '3월 2일~6일' },
    });

    expect(env.calls).toEqual([
      {
        url: 'http://hwp/template/fill',
        body: {
          template_b64: TEMPLATE.toString('base64'),
          values: { '출장 목적': '박람회 참관', '출장 기간': '3월 2일~6일' },
        },
      },
    ]);
    expect(env.files).toEqual([{ buffer: FILLED, filename: '출장보고 양식.hwpx' }]);
    expect(env.saved).toEqual([
      expect.objectContaining({
        kind: 'report',
        resultId: 'result-1',
        conversationId: 'convo-1',
        title: 'trip-report',
        body: '출장 목적: 박람회 참관\n출장 기간: 3월 2일~6일',
        file: { file_id: 'file-1', filename: '출장보고 양식.hwpx' },
      }),
    ]);
    expect(message.artifact?.task_result).toMatchObject({
      resultId: 'result-1',
      kind: 'report',
      file: { file_id: 'file-1', filename: '출장보고 양식.hwpx' },
    });
    expect(message.content).toContain('결과 카드에 표시했습니다');
    expect(message.content).toContain('카드에서 내려받을 수 있습니다');
    expect(message.content).not.toContain('화면에 열었습니다');
  });

  it('asks the model to retry when template filling is busy', async () => {
    const busyResponse = new Response(
      JSON.stringify({ error: 'busy', message: 'no worker slots' }),
      { status: 429 },
    );
    const env = setup(fakeHwp(undefined, busyResponse));
    const message = await env.invoke({ template: '출장보고 양식.hwpx', values: {} });

    expect(message.content).toContain('잠시 후 다시 시도해 주세요.');
    expect(message.content).toContain('HWPX 파일은 생성되지 않았으므로');
    expect(env.saved).toEqual([]);
    expect(env.files).toEqual([]);
  });

  it('refuses a template that is not offered this turn without calling hwp-mcp', async () => {
    const env = setup();
    const message = await env.invoke({ template: '다른 양식.hwpx', values: {} });

    expect(env.calls).toEqual([]);
    expect(env.saved).toEqual([]);
    expect(message.content).toContain('출장보고 양식.hwpx');
    expect(message.artifact).toBeUndefined();
  });

  it('sends only text values for the known fields', async () => {
    const env = setup();
    await env.invoke({
      template: '출장보고 양식.hwpx',
      values: { '출장 목적': 5, '출장 기간': { a: 1 }, 기타: '무시' },
    });
    expect(env.calls[0].body.values).toEqual({ '출장 목적': '5' });
  });
});

describe('createSkillTemplateSource', () => {
  const stored = {
    relativePath: 'assets/doc.hwpx',
    filename: '출장보고 양식.hwpx',
    filepath: '/uploads/u1/f1__doc.hwpx',
    storageKey: 'uploads/u1/f1__doc.hwpx',
    source: 's3',
    bytes: TEMPLATE.length,
  };

  it('reads the stored template bytes by the recorded storage key', async () => {
    const getDownloadStream = jest.fn(async () => Readable.from([TEMPLATE]));
    const source = createSkillTemplateSource({
      listSkillFiles: async () => [stored],
      getSkillFileByPath: async () => stored,
      getDownloadStream,
    });

    expect(await source.readSkillFile(SKILL_ID, 'assets/doc.hwpx')).toEqual(TEMPLATE);
    expect(getDownloadStream).toHaveBeenCalledWith('s3', 'uploads/u1/f1__doc.hwpx');
  });

  it('skips a template larger than the skill file upload limit', async () => {
    const getDownloadStream = jest.fn(async () => Readable.from([TEMPLATE]));
    const source = createSkillTemplateSource({
      listSkillFiles: async () => [stored],
      getSkillFileByPath: async () => ({ ...stored, bytes: 5_000_001 }),
      getDownloadStream,
    });

    expect(await source.readSkillFile(SKILL_ID, 'assets/doc.hwpx')).toBeNull();
    expect(getDownloadStream).not.toHaveBeenCalled();
  });

  it('stops reading when the actual template stream exceeds the upload limit', async () => {
    const oversizedStream = Readable.from([Buffer.alloc(3_000_000), Buffer.alloc(3_000_000)]);
    const source = createSkillTemplateSource({
      listSkillFiles: async () => [stored],
      getSkillFileByPath: async () => ({ ...stored, bytes: TEMPLATE.length }),
      getDownloadStream: async () => oversizedStream,
    });

    expect(await source.readSkillFile(SKILL_ID, 'assets/doc.hwpx')).toBeNull();
  });
});
