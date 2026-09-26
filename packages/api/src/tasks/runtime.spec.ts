import type { StoredFile } from './runtime';
import { loadConversationDocuments } from './runtime';

const files: Array<StoredFile & { user: string }> = [
  { user: 'u1', file_id: 'a', filename: 'a.hwp', type: 'application/x-hwp', text: '가' },
  { user: 'u1', file_id: 'b', filename: 'b.pdf', type: 'application/pdf', text: '나' },
  { user: 'u1', file_id: 'img', filename: 'c.png', type: 'image/png' },
  { user: 'u2', file_id: 'other', filename: 'x.txt', type: 'text/plain', text: '남의 파일' },
  { user: 'u1', file_id: 'new', filename: 'd.txt', type: 'text/plain', text: '라' },
];

const messages = [
  { files: [{ file_id: 'b' }] },
  { files: [{ file_id: 'a' }, { file_id: 'other' }, { file_id: 'img' }] },
];

function deps(readPdf?: (file: StoredFile) => Promise<string[]>) {
  const queries: Array<Record<string, unknown>> = [];
  return {
    queries,
    getMessages: async (filter: Record<string, unknown>) => {
      queries.push(filter);
      return messages;
    },
    getFiles: async (filter: Record<string, unknown>) => {
      const ids = (filter.file_id as { $in: string[] }).$in;
      return files.filter((file) => ids.includes(file.file_id) && file.user === filter.user);
    },
    readPdf,
  };
}

describe('loadConversationDocuments', () => {
  it('returns the user files of the conversation in message order, skipping images', async () => {
    const env = deps(async () => ['1쪽', '2쪽']);
    const docs = await loadConversationDocuments({
      userId: 'u1',
      conversationId: 'c1',
      requestFileIds: ['new'],
      ...env,
    });
    expect(docs.map((doc) => doc.file_id)).toEqual(['b', 'a', 'new']);
    expect(env.queries).toEqual([{ conversationId: 'c1', user: 'u1' }]);
    expect(docs[0].pageStarts).toEqual([0, 3]);
  });

  it('lets file_ids narrow the conversation files but never add others', async () => {
    const docs = await loadConversationDocuments({
      userId: 'u1',
      conversationId: 'c1',
      fileIds: ['a', 'not-in-conversation'],
      ...deps(),
    });
    expect(docs.map((doc) => doc.file_id)).toEqual(['a']);
  });

  it('falls back to stored text marked text_only when PDF pages cannot be read', async () => {
    const docs = await loadConversationDocuments({
      userId: 'u1',
      conversationId: 'c1',
      ...deps(async () => {
        throw new Error('broken pdf');
      }),
    });
    expect(docs[0]).toMatchObject({ file_id: 'b', text: '나', parse: 'text_only' });
    expect(docs[0].pageStarts).toBeUndefined();
  });
});
