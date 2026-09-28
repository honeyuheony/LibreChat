import { useRef, useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import type { RegexLike } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { selectFolderUploads } from './folder';
import useLocalize from '~/hooks/useLocalize';

/** 폴더에서 허용 형식만 골라 기존 업로드 경로(`handleFiles`)로 한 번에 넘긴다. */
export default function useFolderUpload({
  supportedMimeTypes,
  handleFiles,
  setFilesLoading,
}: {
  supportedMimeTypes?: RegexLike[];
  handleFiles: (files: File[]) => Promise<boolean>;
  setFilesLoading: (loading: boolean) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const folderInputRef = useRef<HTMLInputElement>(null);

  /* React 가 webkitdirectory 속성을 타입으로 모르므로 여는 순간 직접 붙인다. */
  const onPickFolder = useCallback(() => {
    const input = folderInputRef.current;
    if (!input) {
      return;
    }
    input.setAttribute('webkitdirectory', '');
    input.value = '';
    input.click();
  }, []);

  const onFolderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      event.stopPropagation();
      const picked = Array.from(event.target.files ?? []);
      event.target.value = '';
      const { accepted, skipped } = selectFolderUploads(picked, supportedMimeTypes);
      if (skipped > 0) {
        showToast({
          message: localize('com_ui_upload_folder_skipped' as TranslationKeys, { 0: skipped }),
          status: 'warning',
        });
      }
      if (accepted.length === 0) {
        return;
      }
      setFilesLoading(true);
      void handleFiles(accepted);
    },
    [supportedMimeTypes, showToast, localize, setFilesLoading, handleFiles],
  );

  return { folderInputRef, onPickFolder, onFolderChange };
}
