import { useState } from 'react';
import { dataService } from 'librechat-data-provider';
import { Button, useToastContext } from '@librechat/client';
import type { TranslationKeys } from '~/hooks';
import { useLocalize } from '~/hooks';

type ExportButtonProps = {
  kind: 'skill' | 'pack';
  id: string;
  fileName: string;
  className?: string;
};

const BASE_CLASS = 'h-auto border border-transparent px-[11px] py-[3px] text-text-tertiary';

const download = {
  skill: dataService.exportSkill,
  pack: dataService.exportSkillPack,
};

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** 스킬이나 팩을 Claude 플러그인 폴더 zip 으로 내려받는다. 담을 스킬은 서버가 권한대로 고른다. */
export default function ExportButton({ kind, id, fileName, className }: ExportButtonProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [pending, setPending] = useState(false);

  const exportZip = async () => {
    setPending(true);
    try {
      const response = await download[kind](id);
      saveBlob(response.data, fileName);
      showToast({
        status: 'success',
        message: localize('com_skills_export_done' as TranslationKeys, { file: fileName }),
      });
    } catch {
      showToast({ status: 'error', message: localize('com_ui_error') });
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="pill"
      disabled={pending}
      aria-busy={pending}
      onClick={() => void exportZip()}
      className={[BASE_CLASS, className].filter(Boolean).join(' ')}
    >
      {localize('com_skills_export' as TranslationKeys)}
    </Button>
  );
}
