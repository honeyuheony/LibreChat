import type { TaskResult, TaskStats } from 'librechat-data-provider';

/** 메시지 첨부에는 요약만 두고, 표 행과 본문은 결과 저장소에서 가져온다. */
export type TaskResultAttachment = {
  resultId: string;
  kind: TaskResult['kind'];
  title: string;
  stats: TaskStats;
  file?: { file_id: string; filename: string };
  /** 보고서 본문은 있지만 HWPX 파일을 만들지 못했을 때 실패 이유를 담는다. */
  notice?: string;
};
