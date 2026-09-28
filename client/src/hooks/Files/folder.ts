import { inferMimeType, fileConfig as defaultFileConfig } from 'librechat-data-provider';
import type { EndpointFileConfig, RegexLike } from 'librechat-data-provider';

/**
 * 안내 문구에 보여 줄 문서 형식. 전체 허용 목록은 너무 길어서 자주 쓰는 것만 추린다.
 * `inferMimeType` 이 확장자로 알아내지 못하는 형식이라, 브라우저가 형식을 비워 줄 때도 여기서 채운다.
 */
const DOCUMENT_TYPES: Record<string, string> = {
  hwp: 'application/x-hwp',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const resolveMimeType = (name: string, type: string): string => {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return inferMimeType(name, type) || DOCUMENT_TYPES[extension] || '';
};

const isAllowed = (mimeType: string, supportedMimeTypes?: RegexLike[]): boolean =>
  mimeType !== '' && defaultFileConfig.checkType(mimeType, supportedMimeTypes);

/**
 * 폴더에는 설정 파일·실행 파일이 섞여 있기 마련이라, 허용하지 않는 형식은 한 파일 때문에
 * 전체 업로드가 막히지 않도록 미리 걸러 낸다. 개수·크기 제한은 기존 업로드 경로가 그대로 검사한다.
 */
export function selectFolderUploads(
  files: File[],
  supportedMimeTypes?: RegexLike[],
): { accepted: File[]; skipped: number } {
  const accepted: File[] = [];
  for (const file of files) {
    const mimeType = resolveMimeType(file.name, file.type);
    if (!isAllowed(mimeType, supportedMimeTypes)) {
      continue;
    }
    /* 형식이 빈 파일은 업로드 검사에서 통째로 거절되므로 알아낸 형식을 채워 넘긴다. */
    accepted.push(file.type === '' ? new File([file], file.name, { type: mimeType }) : file);
  }
  return { accepted, skipped: files.length - accepted.length };
}

export function getUploadHint(
  endpointFileConfig?: Pick<EndpointFileConfig, 'supportedMimeTypes' | 'fileSizeLimit'>,
): { formats: string[]; perFileLimit?: string } {
  const formats = Object.keys(DOCUMENT_TYPES).filter((ext) =>
    isAllowed(resolveMimeType(`file.${ext}`, ''), endpointFileConfig?.supportedMimeTypes),
  );
  const limit = endpointFileConfig?.fileSizeLimit;
  const perFileLimit =
    limit != null && limit > 0 ? `${Math.round((limit / 1024 / 1024) * 10) / 10} MB` : undefined;
  return { formats, perFileLimit };
}
