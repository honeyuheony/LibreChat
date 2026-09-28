/** 데스크톱 앱은 앱 창의 브라우저 식별 문자열 끝에 「AIPlaygroundDesk/버전」을 붙인다. */
const DESK_APP_USER_AGENT_MARK = ' AIPlaygroundDesk/';

/** 데스크톱 앱의 preload 가 앱 창에만 여는 창구. */
interface DeskAppBridge {
  openFolderSettings: () => Promise<boolean>;
}

declare global {
  interface Window {
    aiPlaygroundDesk?: DeskAppBridge;
  }
}

export function isDeskApp(): boolean {
  return navigator.userAgent.includes(DESK_APP_USER_AGENT_MARK);
}

/** 앱 창이 폴더 설정 창구를 열었을 때만 여는 함수를 돌려준다. */
export function getDeskFolderSettingsOpener(): (() => void) | null {
  const openFolderSettings = isDeskApp() ? window.aiPlaygroundDesk?.openFolderSettings : undefined;
  if (typeof openFolderSettings !== 'function') {
    return null;
  }
  return () => {
    void openFolderSettings();
  };
}
