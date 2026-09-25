import {
  describeToolStep,
  directionParticle,
  getToolErrorMessage,
  objectParticle,
  subjectParticle,
  summarizeToolOutput,
} from '../steps';
import ko from '~/locales/ko/translation.json';

const koStrings = ko as Record<string, string>;
const localizeKo = (key: string, values: Record<string, string | number> = {}) =>
  koStrings[key].replace(/{{(\w+)}}/g, (_, name: string) => String(values[name]));

/** Tool outputs copied from conversations on the demo stack (desk-relay via FastMCP). */
const LIST_FOLDER_OUTPUT =
  '{\n  "name": "e2e-사업안내.hwp",\n  "path": "e2e-사업안내.hwp",\n  "kind": "file",\n  "bytes": 193536\n}\n\n{\n  "name": "메모.txt",\n  "path": "메모.txt",\n  "kind": "file",\n  "bytes": 31\n}';
const RELAY_OFFLINE_OUTPUT =
  'Error executing tool read_file: PC 의 업무 에이전트 앱이 꺼져 있다. PC 에서 앱을 켠다.';

describe('Korean particles', () => {
  it('picks 을/를 by the final sound of Hangul, Latin letters and digits', () => {
    expect(objectParticle('메모')).toBe('를');
    expect(objectParticle('예산안')).toBe('을');
    expect(objectParticle('memo.txt')).toBe('를');
    expect(objectParticle('index.html')).toBe('을');
    expect(objectParticle('2025')).toBe('를');
    expect(objectParticle('2026')).toBe('을');
    expect(objectParticle('3')).toBe('을');
  });

  it('picks 이/가 ignoring trailing punctuation', () => {
    expect(subjectParticle('예산')).toBe('이');
    expect(subjectParticle('메모.')).toBe('가');
  });

  it('uses 로 after a vowel or ㄹ and 으로 after other final consonants', () => {
    expect(directionParticle('내 PC 폴더')).toBe('로');
    expect(directionParticle('Google 캘린더와 메일')).toBe('로');
    expect(directionParticle('웹 검색')).toBe('으로');
  });
});

describe('describeToolStep', () => {
  it('describes list_folder without a path as looking at the folder list', () => {
    expect(describeToolStep('list_folder', '{}', localizeKo)).toBe('폴더 목록을 봄');
  });

  it('names the folder when list_folder is given a path', () => {
    expect(describeToolStep('list_folder', '{"path":"2026/예산"}', localizeKo)).toBe(
      '예산 폴더 목록을 봄',
    );
  });

  it('describes read_file with the file name and the right particle', () => {
    expect(describeToolStep('read_file', '{"path":"memo.txt"}', localizeKo)).toBe(
      'memo.txt를 읽음',
    );
  });

  it('describes read_hangul_file with the base name of the path', () => {
    expect(
      describeToolStep('read_hangul_file', { path: '2026/3분기_예산안_v2.hwpx' }, localizeKo),
    ).toBe('3분기_예산안_v2.hwpx를 읽음');
  });

  it('describes search_files with the quoted pattern', () => {
    expect(describeToolStep('search_files', '{"pattern":"예산"}', localizeKo)).toBe(
      '파일 이름에 "예산"이 들어간 파일을 찾음',
    );
  });

  it('accepts dashed MCP tool names such as tavily-search', () => {
    expect(describeToolStep('tavily-search', '{"query":"MCP 규격"}', localizeKo)).toBe(
      '웹에서 "MCP 규격"을 검색함',
    );
  });

  it('falls back to "<tool> 실행함" for a tool without a phrase', () => {
    expect(describeToolStep('summarize_budget', '{}', localizeKo)).toBe('summarize_budget 실행함');
  });

  it('keeps the argument-free phrase while arguments are still partial JSON', () => {
    expect(describeToolStep('read_file', '{"pa', localizeKo)).toBe('파일을 읽음');
  });
});

describe('summarizeToolOutput', () => {
  it('counts the JSON blocks FastMCP returns for a folder list', () => {
    expect(summarizeToolOutput('list_folder', LIST_FOLDER_OUTPUT, localizeKo)).toBe('2개');
  });

  it('reports zero for the empty "(No response)" reply', () => {
    expect(summarizeToolOutput('search_files', '(No response)', localizeKo)).toBe('0개');
  });

  it('reports the line count of a text read', () => {
    expect(summarizeToolOutput('read_file', '첫 줄\n둘째 줄\n', localizeKo)).toBe('2줄');
  });

  it('gives no summary for a failed step', () => {
    expect(summarizeToolOutput('read_file', RELAY_OFFLINE_OUTPUT, localizeKo)).toBeNull();
  });
});

describe('getToolErrorMessage', () => {
  it('returns the relay message without the "Error executing tool" prefix', () => {
    expect(getToolErrorMessage(RELAY_OFFLINE_OUTPUT)).toBe(
      'PC 의 업무 에이전트 앱이 꺼져 있다. PC 에서 앱을 켠다.',
    );
  });

  it('returns null for a successful output', () => {
    expect(getToolErrorMessage('3분기 예산 메모\n')).toBeNull();
  });
});
