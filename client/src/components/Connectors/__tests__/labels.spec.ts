import english from '~/locales/en/translation.json';
import { getToolLabel } from '../labels';

describe('getToolLabel', () => {
  it('names a tool the same way on every server that has it', () => {
    expect(getToolLabel('my-pc', 'search_files')).toEqual(
      getToolLabel('filesystem', 'search_files'),
    );
    expect(english[getToolLabel('my-pc', 'search_files')!.title]).toBe('Find files');
  });

  it('lets one server rename a tool whose meaning differs there', () => {
    expect(english[getToolLabel('filesystem', 'read_file')!.title]).toBe('Read file (legacy)');
    expect(english[getToolLabel('my-pc', 'read_file')!.title]).toBe('Read file');
  });

  it('has no label for a tool it does not know', () => {
    expect(getToolLabel('google-workspace', 'drive_export')).toBeUndefined();
  });
});
