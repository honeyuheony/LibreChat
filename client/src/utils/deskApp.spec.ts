import { getDeskFolderSettingsOpener, isDeskApp } from './deskApp';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const DESK_USER_AGENT = `${BROWSER_USER_AGENT} AIPlaygroundDesk/0.1.7`;

function setUserAgent(userAgent: string) {
  jest.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

afterEach(() => {
  jest.restoreAllMocks();
  delete window.aiPlaygroundDesk;
});

describe('isDeskApp', () => {
  it('is true when the user agent ends with the desktop app marker', () => {
    setUserAgent(DESK_USER_AGENT);
    expect(isDeskApp()).toBe(true);
  });

  it('is false in an ordinary browser', () => {
    setUserAgent(BROWSER_USER_AGENT);
    expect(isDeskApp()).toBe(false);
  });
});

describe('getDeskFolderSettingsOpener', () => {
  it('calls the bridge inside the desktop app', () => {
    setUserAgent(DESK_USER_AGENT);
    const openFolderSettings = jest.fn().mockResolvedValue(true);
    window.aiPlaygroundDesk = { openFolderSettings };

    getDeskFolderSettingsOpener()?.();

    expect(openFolderSettings).toHaveBeenCalledTimes(1);
    expect(openFolderSettings).toHaveBeenCalledWith();
  });

  it('is null inside the desktop app without the bridge', () => {
    setUserAgent(DESK_USER_AGENT);
    expect(getDeskFolderSettingsOpener()).toBeNull();
  });

  it('ignores a bridge-like object in an ordinary browser', () => {
    setUserAgent(BROWSER_USER_AGENT);
    const openFolderSettings = jest.fn().mockResolvedValue(true);
    window.aiPlaygroundDesk = { openFolderSettings };

    expect(getDeskFolderSettingsOpener()).toBeNull();
    expect(openFolderSettings).not.toHaveBeenCalled();
  });
});
