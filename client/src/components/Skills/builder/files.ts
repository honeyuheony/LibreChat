import type { TSkillFileKind } from 'librechat-data-provider';
import type { BuilderFile, BuilderState } from './state';

const TEMPLATE_NAME = /양식|서식|템플릿|template|form/i;
const REFERENCE_NAME = /가이드|용어|지침|guide|glossary/i;
const MAX_EXAMPLES = 3;
/** 스킬 파일 API 가 받는 경로 글자. 서버의 업로드 검사와 같은 범위다. */
const UNSAFE_PATH_CHARS = /[^a-zA-Z0-9._-]+/g;
const EXTENSION = /\.[a-zA-Z0-9]{1,10}$/;

/** 양식은 하나뿐이고, 예시가 이미 셋이면 나머지는 참고로 둔다. */
function classify(name: string, files: BuilderFile[]): TSkillFileKind {
  if (TEMPLATE_NAME.test(name) && !files.some((file) => file.kind === 'assets')) {
    return 'assets';
  }
  if (REFERENCE_NAME.test(name)) {
    return 'references';
  }
  const examples = files.filter((file) => file.kind === 'examples').length;
  return examples < MAX_EXAMPLES ? 'examples' : 'references';
}

/** 한글 이름은 API 가 받지 않으므로 영문·숫자만 남기고, 원래 이름은 SKILL.md 에 따로 적는다. */
export function skillFilePath(kind: TSkillFileKind, name: string, taken: Set<string>): string {
  const extension = name.match(EXTENSION)?.[0] ?? '';
  const stem =
    name
      .slice(0, name.length - extension.length)
      .replace(UNSAFE_PATH_CHARS, '-')
      .replace(/^[-.]+|-+$/g, '') || 'doc';
  let path = `${kind}/${stem}${extension}`;
  for (let n = 2; taken.has(path); n++) {
    path = `${kind}/${stem}-${n}${extension}`;
  }
  return path;
}

/** 같은 이름을 다시 고르면 새 내용으로 바꾼다. 종류와 경로는 처음 붙일 때 정한다. */
export function attachFiles(state: BuilderState, picked: File[]): BuilderState {
  let files = state.files;
  for (const upload of picked) {
    const existing = files.find((file) => file.name === upload.name);
    if (existing?.path) {
      files = files.map((file) => (file === existing ? { ...file, upload } : file));
      continue;
    }
    const rest = files.filter((file) => file !== existing);
    const kind = existing?.kind ?? classify(upload.name, rest);
    const taken = new Set(rest.flatMap((file) => (file.path ? [file.path] : [])));
    files = [
      ...rest,
      { name: upload.name, kind, upload, path: skillFilePath(kind, upload.name, taken) },
    ];
  }
  return { ...state, files };
}

export type StoredFile = Required<BuilderFile>;

export function storedFiles(files: BuilderFile[]): StoredFile[] {
  return files.filter((file): file is StoredFile => file.upload != null && file.path != null);
}

export type SkillFileDeps = {
  skillId: string;
  upload: (variables: { skillId: string; relativePath: string; file: File }) => Promise<unknown>;
  remove: (variables: { skillId: string; relativePath: string }) => Promise<unknown>;
};

/** 같은 이름으로 내용만 바꾸면 SKILL.md 가 그대로라서 저장할지 판단할 때 따로 본다. */
export function hasUnsyncedFiles(files: BuilderFile[], stored: Map<string, File>): boolean {
  const wanted = storedFiles(files);
  return (
    wanted.length !== stored.size || wanted.some((file) => stored.get(file.path) !== file.upload)
  );
}

/**
 * 스킬 폴더를 붙인 문서와 맞춘다. `stored` 는 이 편집기가 경로마다 올린 파일이며 성공한 것만 바꾼다.
 * 올리거나 지운 것이 있으면 서버가 스킬 버전을 올리므로 true 를 돌려준다.
 */
export async function syncSkillFiles(
  files: BuilderFile[],
  stored: Map<string, File>,
  { skillId, upload, remove }: SkillFileDeps,
): Promise<boolean> {
  const wanted = storedFiles(files);
  const keep = new Set(wanted.map((file) => file.path));
  let changed = false;
  for (const path of [...stored.keys()]) {
    if (keep.has(path)) {
      continue;
    }
    await remove({ skillId, relativePath: path });
    stored.delete(path);
    changed = true;
  }
  for (const file of wanted) {
    if (stored.get(file.path) === file.upload) {
      continue;
    }
    await upload({ skillId, relativePath: file.path, file: file.upload });
    stored.set(file.path, file.upload);
    changed = true;
  }
  return changed;
}
