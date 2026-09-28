import React from 'react';
import { RecoilRoot } from 'recoil';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { getAgentServerNames } from '../useAgentConnectorSelection';
import { cleanupTimestampedStorage } from '~/utils/timestamps';
import { newChatExtraConnectorAtom } from '~/store';
import ToolsMenu from '../ToolsMenu';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const render = (
  ui: React.ReactElement,
  client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } }),
) =>
  rtlRender(
    <QueryClientProvider client={client}>
      <RecoilRoot>
        <JotaiProvider>{ui}</JotaiProvider>
      </RecoilRoot>
    </QueryClientProvider>,
  );

const mockToggleServerSelection = jest.fn();
const mockOnConfigClick = jest.fn();
const mockWebSearchChange = jest.fn();

const connectedStatus = { connectionState: 'connected', requiresOAuth: false };
const oauthPendingStatus = { connectionState: 'disconnected', requiresOAuth: true };

const defaultManager = {
  mcpValues: ['files'] as string[],
  selectableServers: [
    { serverName: 'files', config: { title: 'Shared files', description: 'Reads shared docs' } },
    { serverName: 'calendar', config: { title: 'Calendar', description: 'Reads events' } },
  ],
  connectionStatus: { files: connectedStatus, calendar: oauthPendingStatus } as Record<
    string,
    unknown
  >,
  getConfigDialogProps: () => null,
  toggleServerSelection: mockToggleServerSelection,
  getServerStatusIconProps: (serverName: string) => ({
    serverName,
    onConfigClick: mockOnConfigClick,
    hasCustomUserVars: false,
  }),
};

const toggle = (enabled: boolean, onChange = jest.fn()) => ({
  isToolEnabled: enabled,
  toggleState: enabled,
  debouncedChange: onChange,
  authData: { authTypes: [['key', 'system_defined']] },
});

let mockManager = { ...defaultManager };
let mockAgentTools: string[] | undefined;

jest.mock('~/hooks/Agents/useAgentToolPermissions', () => ({
  __esModule: true,
  default: () => ({ tools: mockAgentTools }),
}));
let mockContextTools: Record<string, unknown> = {};
let mockUser: Record<string, unknown> = { personalization: {} };

jest.mock('librechat-data-provider', () => {
  const actual =
    jest.requireActual<typeof import('librechat-data-provider')>('librechat-data-provider');
  return { ...actual, dataService: { ...actual.dataService } };
});

jest.mock('~/hooks/MCP/useMCPRefresh', () => ({
  useMCPRefresh: () => undefined,
}));

jest.mock('~/Providers', () => ({
  useBadgeRowContext: () => ({
    conversationId: 'test-conv',
    storageContextKey: undefined,
    agentsConfig: null,
    mcpServerManager: mockManager,
    ...mockContextTools,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${values[0]}` : key,
  useHasAccess: () => true,
  useHasMemoryAccess: () => false,
  useAuthContext: () => ({ user: mockUser }),
  useAgentCapabilities: () => ({
    codeEnabled: false,
    memoryEnabled: false,
    webSearchEnabled: true,
    artifactsEnabled: false,
    fileSearchEnabled: false,
    skillsEnabled: false,
  }),
}));

jest.mock('@librechat/client', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    TooltipAnchor: ({
      children,
      render,
    }: {
      children: React.ReactNode;
      render: React.ReactElement;
    }) => R.cloneElement(render, {}, ...(Array.isArray(children) ? children : [children])),
    MCPIcon: ({ className }: { className?: string }) => R.createElement('span', { className }),
    VectorIcon: ({ className }: { className?: string }) => R.createElement('span', { className }),
  };
});

jest.mock('~/components/MCP/MCPConfigDialog', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('~/components/ui/CustomIcon', () => ({
  __esModule: true,
  default: () => null,
}));

describe('ToolsMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockManager = { ...defaultManager };
    mockContextTools = { webSearch: toggle(true, mockWebSearchChange) };
    mockAgentTools = undefined;
    mockUser = { personalization: {} };
    localStorage.clear();
  });

  it('counts the selected connectors and enabled built-in tools on the trigger', () => {
    render(<ToolsMenu showBuiltinTools={true} />);

    expect(screen.getByTestId('tools-menu-count')).toHaveTextContent('2');
    expect(
      screen.getByRole('button', { name: 'com_ui_tools, com_ui_tools_enabled_count:2' }),
    ).toBeInTheDocument();
  });

  it('lists connectors and built-in tools in one menu', async () => {
    const user = userEvent.setup();
    render(<ToolsMenu showBuiltinTools={true} />);

    await user.click(screen.getByTestId('tools-menu-button'));

    const menu = screen.getByRole('menu', { name: 'com_ui_tools' });
    const files = within(menu).getByRole('menuitemcheckbox', { name: 'Shared files' });
    expect(files).toHaveAttribute('aria-checked', 'true');
    expect(within(files).getByText('Reads shared docs')).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitemcheckbox', { name: 'com_ui_web_search' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('heads the connector group as data sources and MCP servers', async () => {
    const user = userEvent.setup();
    render(<ToolsMenu showBuiltinTools={true} />);

    await user.click(screen.getByTestId('tools-menu-button'));

    const group = screen.getByRole('group', { name: 'com_ui_tools_data_sources' });
    expect(within(group).getByRole('menuitemcheckbox', { name: 'Shared files' })).toBeVisible();
  });

  it('sets the group headings in regular weight and the muted text color', async () => {
    const user = userEvent.setup();
    render(<ToolsMenu showBuiltinTools={true} />);

    await user.click(screen.getByTestId('tools-menu-button'));

    const heading = screen.getByText('com_ui_tools_data_sources');
    expect(heading).toHaveClass('text-xs', 'font-normal', 'text-text-muted');
    expect(heading).not.toHaveClass('font-semibold');
    expect(heading).not.toHaveClass('text-text-tertiary');
  });

  it('toggles a connector without closing the menu', async () => {
    const user = userEvent.setup();
    render(<ToolsMenu showBuiltinTools={true} />);

    await user.click(screen.getByTestId('tools-menu-button'));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Shared files' }));

    expect(mockToggleServerSelection).toHaveBeenCalledTimes(1);
    expect(mockToggleServerSelection).toHaveBeenCalledWith('files');
    expect(screen.getByRole('menu', { name: 'com_ui_tools' })).toBeVisible();
  });

  it('opens the data hub on a connector that needs a connection', async () => {
    const user = userEvent.setup();
    render(<ToolsMenu showBuiltinTools={true} />);

    await user.click(screen.getByTestId('tools-menu-button'));
    const calendar = screen.getByRole('menuitemcheckbox', {
      name: 'Calendar, com_ui_connection_required',
    });
    expect(within(calendar).queryByTestId('tools-menu-switch')).not.toBeInTheDocument();

    await user.click(within(calendar).getByTestId('tools-menu-connect'));

    expect(mockNavigate).toHaveBeenCalledWith('/connectors/calendar');
    expect(screen.getByTestId('tools-menu-button')).toHaveAttribute('aria-expanded', 'false');
    expect(mockOnConfigClick).not.toHaveBeenCalled();
    expect(mockToggleServerSelection).not.toHaveBeenCalled();
  });

  describe('with the 「내 PC 폴더」 connector', () => {
    const deskStatus = (state: 'online' | 'offline') => ({
      state,
      deviceName: null,
      folders: [],
      connectedAt: null,
      installerUrl: 'https://relay.example/app/desk-app-setup-0.1.2.exe',
    });

    beforeEach(() => {
      mockManager = {
        ...defaultManager,
        selectableServers: [
          { serverName: 'my-pc', config: { title: 'My PC folder', description: 'Reads a folder' } },
        ],
        connectionStatus: { 'my-pc': connectedStatus },
      };
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('says the desktop app is off and opens the download page from the row', async () => {
      jest.spyOn(dataService, 'getDeskStatus').mockResolvedValue(deskStatus('offline'));
      const openWindow = jest.spyOn(window, 'open').mockReturnValue(null);
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      const row = screen.getByRole('menuitemcheckbox', { name: 'My PC folder' });
      expect(await within(row).findByText('com_ui_tools_desk_app_off')).toBeInTheDocument();
      expect(within(row).queryByText('Reads a folder')).not.toBeInTheDocument();

      await user.click(within(row).getByTestId('tools-menu-desk-download'));

      expect(openWindow).toHaveBeenCalledTimes(1);
      expect(openWindow).toHaveBeenCalledWith('/download', '_blank', 'noopener,noreferrer');
      expect(mockToggleServerSelection).not.toHaveBeenCalled();
    });

    it('keeps the plain description while the desktop app is on', async () => {
      const getDeskStatus = jest
        .spyOn(dataService, 'getDeskStatus')
        .mockResolvedValue(deskStatus('online'));
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      const row = screen.getByRole('menuitemcheckbox', { name: 'My PC folder' });

      await waitFor(() => expect(getDeskStatus).toHaveBeenCalledTimes(1));
      await act(async () => {
        await getDeskStatus.mock.results[0].value;
      });
      expect(within(row).getByText('Reads a folder')).toBeInTheDocument();
      expect(within(row).queryByTestId('tools-menu-desk-download')).not.toBeInTheDocument();
    });
  });

  describe('with uploads available', () => {
    const upload = () => ({
      onPickFiles: jest.fn(),
      onPickFolder: jest.fn(),
      hint: 'hwp · pdf · 20 MB',
    });

    it('offers files and a folder from one row that shows the endpoint limits', async () => {
      const user = userEvent.setup();
      const actions = upload();
      render(<ToolsMenu showBuiltinTools={false} upload={actions} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      const row = screen.getByTestId('tools-menu-upload');
      expect(within(row).getByText('com_ui_upload_file_or_folder')).toBeVisible();
      expect(within(row).getByText('hwp · pdf · 20 MB')).toBeVisible();
      /* 형식 목록과 크기 제한은 한 줄에 다 들어가지 않으므로 잘라 내지 않고 접는다. */
      expect(within(row).getByText('hwp · pdf · 20 MB')).not.toHaveClass('truncate');

      await user.click(within(row).getByRole('menuitem', { name: 'com_ui_upload_pick_folder' }));
      expect(actions.onPickFolder).toHaveBeenCalledTimes(1);
      expect(actions.onPickFiles).not.toHaveBeenCalled();
    });

    it('opens the file picker from the files button', async () => {
      const user = userEvent.setup();
      const actions = upload();
      render(<ToolsMenu showBuiltinTools={false} upload={actions} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      await user.click(screen.getByRole('menuitem', { name: 'com_ui_upload_pick_files' }));
      expect(actions.onPickFiles).toHaveBeenCalledTimes(1);
      expect(actions.onPickFolder).not.toHaveBeenCalled();
    });

    it('leads the data sources with the files uploaded to this chat', async () => {
      const user = userEvent.setup();
      const queryClient = new QueryClient();
      queryClient.setQueryData(
        [QueryKeys.messages, 'test-conv'],
        [
          { isCreatedByUser: true, files: [{ file_id: 'a' }, { file_id: 'b' }] },
          { isCreatedByUser: false, files: [{ file_id: 'generated' }] },
          { isCreatedByUser: true, files: [{ file_id: 'a' }] },
        ],
      );
      render(
        <ToolsMenu showBuiltinTools={false} upload={upload()} attachedFileCount={1} />,
        queryClient,
      );

      await user.click(screen.getByTestId('tools-menu-button'));
      const group = screen.getByRole('group', { name: 'com_ui_tools_data_sources' });
      const [first] = within(group).getAllByRole('menuitemcheckbox');
      expect(first).toHaveAccessibleName('com_ui_my_uploaded_files');
      expect(first).toHaveAttribute('aria-checked', 'true');
      expect(within(first).getByText('com_ui_my_uploaded_files_count:3')).toBeVisible();
    });

    it('says nothing is uploaded yet when the chat has no files', async () => {
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} upload={upload()} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      expect(screen.getByText('com_ui_my_uploaded_files_empty')).toBeVisible();
    });

    it('switches the uploaded files off for this chat without closing the menu', async () => {
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} upload={upload()} attachedFileCount={1} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      await user.click(screen.getByTestId('tools-menu-my-files'));

      expect(screen.getByTestId('tools-menu-my-files')).toHaveAttribute('aria-checked', 'false');
      expect(localStorage.getItem('EXCLUDE_FILES_test-conv')).toBe('true');
    });
  });

  it('flips a built-in tool through its toggle', async () => {
    const user = userEvent.setup();
    render(<ToolsMenu showBuiltinTools={true} />);

    await user.click(screen.getByTestId('tools-menu-button'));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'com_ui_web_search' }));

    expect(mockWebSearchChange).toHaveBeenCalledWith({ value: false });
  });

  it('leaves built-in tools out where they do not reach the model', async () => {
    const user = userEvent.setup();
    render(<ToolsMenu showBuiltinTools={false} />);

    expect(screen.getByTestId('tools-menu-count')).toHaveTextContent('1');
    await user.click(screen.getByTestId('tools-menu-button'));
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'com_ui_web_search' }),
    ).not.toBeInTheDocument();
  });

  describe('placed against a laid-out composer', () => {
    const TRIGGER_TOP = 402;
    const MENU_HEIGHT = 434;
    const restores: Array<() => void> = [];

    const stub = <T extends object>(target: T, key: string, descriptor: PropertyDescriptor) => {
      const original = Object.getOwnPropertyDescriptor(target, key);
      Object.defineProperty(target, key, { configurable: true, ...descriptor });
      restores.push(() =>
        original ? Object.defineProperty(target, key, original) : delete (target as never)[key],
      );
    };

    beforeEach(() => {
      stub(document.documentElement, 'clientWidth', { get: () => 1440 });
      stub(document.documentElement, 'clientHeight', { get: () => 900 });
      stub(HTMLElement.prototype, 'offsetHeight', {
        get(this: HTMLElement) {
          return this.querySelector('[role="menu"]') || this.getAttribute('role') === 'menu'
            ? MENU_HEIGHT
            : 0;
        },
      });
      stub(HTMLElement.prototype, 'offsetWidth', {
        get(this: HTMLElement) {
          return this.querySelector('[role="menu"]') || this.getAttribute('role') === 'menu'
            ? 340
            : 0;
        },
      });
    });

    afterEach(() => {
      restores
        .splice(0)
        .reverse()
        .forEach((restore) => restore());
    });

    it('still opens upward and scrolls inside when there is less room above than the menu is tall', async () => {
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={true} />);
      const trigger = screen.getByTestId('tools-menu-button');
      jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
        x: 481,
        y: TRIGGER_TOP,
        top: TRIGGER_TOP,
        left: 481,
        right: 519,
        bottom: TRIGGER_TOP + 38,
        width: 38,
        height: 38,
        toJSON: () => ({}),
      });

      await user.click(trigger);
      const menu = screen.getByRole('menu', { name: 'com_ui_tools' });
      let wrapper: HTMLElement | null = menu;
      await waitFor(() => {
        wrapper = menu;
        while (wrapper && !wrapper.style.transform) {
          wrapper = wrapper.parentElement;
        }
        expect(wrapper?.style.transform).toMatch(/translate3d/);
      });

      const y = Number(/translate3d\([^,]+,\s*(-?[\d.]+)px/.exec(wrapper!.style.transform)?.[1]);
      expect(y).toBeLessThan(TRIGGER_TOP);
      expect(menu.className).toContain('w-[340px]');
    });

    /* ＋ 단추는 입력창 윗변보다 15px 아래에 있어, 단추를 기준으로 두면 메뉴가 입력창 테두리를 덮는다. */
    it('ends 7px above the composer top edge and lines up with its left edge', async () => {
      const SURFACE = { top: 776, left: 286, width: 760, height: 104 };
      const user = userEvent.setup();
      const surface = document.createElement('div');
      jest.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
        ...SURFACE,
        x: SURFACE.left,
        y: SURFACE.top,
        right: SURFACE.left + SURFACE.width,
        bottom: SURFACE.top + SURFACE.height,
        toJSON: () => ({}),
      });
      render(<ToolsMenu showBuiltinTools={true} anchorRef={{ current: surface }} />);
      const trigger = screen.getByTestId('tools-menu-button');
      jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
        x: 301,
        y: 791,
        top: 791,
        left: 301,
        right: 339,
        bottom: 829,
        width: 38,
        height: 38,
        toJSON: () => ({}),
      });

      await user.click(trigger);
      const menu = screen.getByRole('menu', { name: 'com_ui_tools' });
      let wrapper: HTMLElement | null = menu;
      await waitFor(() => {
        wrapper = menu;
        while (wrapper && !wrapper.style.transform) {
          wrapper = wrapper.parentElement;
        }
        expect(wrapper?.style.transform).toMatch(/translate3d/);
      });

      const [, x, y] = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(wrapper!.style.transform)!;
      expect(Number(y)).toBe(SURFACE.top - 7 - MENU_HEIGHT);
      expect(Number(x)).toBe(SURFACE.left);
    });
  });

  it('renders nothing when there is no connector or tool to offer', () => {
    mockManager = { ...defaultManager, selectableServers: [], mcpValues: [] };
    const { container } = render(<ToolsMenu showBuiltinTools={false} />);

    expect(container.firstChild).toBeNull();
  });

  it('hides the count when nothing is turned on', () => {
    mockManager = { ...defaultManager, mcpValues: [] };
    mockContextTools = { webSearch: toggle(false) };
    render(<ToolsMenu showBuiltinTools={true} />);

    expect(screen.queryByTestId('tools-menu-count')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_tools' })).toBeInTheDocument();
  });

  describe('on a saved agent', () => {
    const savedAgent = 'agent_saved';

    beforeEach(() => {
      /* 둘 다 기본으로 켜져 있어 저장된 선택이 없으면 모든 connector가 켜진다. */
      mockManager = {
        ...defaultManager,
        mcpValues: [],
        selectableServers: defaultManager.selectableServers.map((server) => ({
          ...server,
          config: { ...server.config, defaultOn: true },
        })),
      };
      mockAgentTools = ['web_search', 'read_mcp_files', 'list_mcp_files'];
    });

    it('shows every connector the agent carries as on until the chat switches one off', async () => {
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);

      expect(screen.getByTestId('tools-menu-count')).toHaveTextContent('1');
      await user.click(screen.getByTestId('tools-menu-button'));
      expect(screen.getByRole('menuitemcheckbox', { name: 'Shared files' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    it('lists a connector the agent does not carry as unavailable, without a switch', async () => {
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      const calendar = screen.getByTestId('tools-menu-unavailable');
      expect(calendar).toHaveAccessibleName('Calendar, com_ui_connector_unavailable_for_agent');
      expect(calendar).toHaveAttribute('aria-disabled', 'true');
      expect(screen.queryByRole('menuitemcheckbox', { name: /Calendar/ })).not.toBeInTheDocument();
    });

    it('records a switched-off connector for the server instead of the chat selection', async () => {
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      await user.click(screen.getByRole('menuitemcheckbox', { name: 'Shared files' }));

      expect(screen.getByRole('menuitemcheckbox', { name: 'Shared files' })).toHaveAttribute(
        'aria-checked',
        'false',
      );
      expect(screen.queryByTestId('tools-menu-count')).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem('LAST_MCP_DISABLED_test-conv') ?? 'null')).toEqual([
        'files',
      ]);
      expect(mockToggleServerSelection).not.toHaveBeenCalled();
    });

    it("keeps the chat's choice through the startup cleanup of stale storage", async () => {
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      await user.click(screen.getByRole('menuitemcheckbox', { name: 'Shared files' }));
      cleanupTimestampedStorage();

      expect(JSON.parse(localStorage.getItem('LAST_MCP_DISABLED_test-conv') ?? 'null')).toEqual([
        'files',
      ]);
    });

    it('starts a conversation opened with no stored choice from the new-chat defaults', async () => {
      mockManager = {
        ...mockManager,
        selectableServers: [
          { serverName: 'files', config: { title: 'Shared files' } },
          { serverName: 'calendar', config: { title: 'Calendar' } },
        ],
      } as typeof mockManager;
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);

      expect(screen.queryByTestId('tools-menu-count')).not.toBeInTheDocument();
      await user.click(screen.getByTestId('tools-menu-button'));
      expect(
        await screen.findByRole('menuitemcheckbox', { name: 'Shared files', checked: false }),
      ).toBeInTheDocument();
      /* 기본값을 대화의 선택으로 저장해야 다음 메시지에 반영된다. */
      expect(JSON.parse(localStorage.getItem('LAST_MCP_DISABLED_test-conv') ?? 'null')).toEqual([
        'files',
        'calendar',
      ]);
    });

    describe('in a new chat', () => {
      const withConfig = (defaultOn?: boolean) => {
        mockManager = {
          ...mockManager,
          selectableServers: [
            { serverName: 'files', config: { title: 'Shared files', defaultOn } },
            { serverName: 'calendar', config: { title: 'Calendar' } },
          ],
        } as typeof mockManager;
      };

      beforeEach(() => {
        mockContextTools = { ...mockContextTools, conversationId: null };
      });

      it('starts a connector off when neither the user nor the config turns it on', async () => {
        withConfig(undefined);
        const user = userEvent.setup();
        render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);

        expect(screen.queryByTestId('tools-menu-count')).not.toBeInTheDocument();
        await user.click(screen.getByTestId('tools-menu-button'));
        expect(
          await screen.findByRole('menuitemcheckbox', { name: 'Shared files', checked: false }),
        ).toBeInTheDocument();
      });

      it('starts a connector on when the config sets defaultOn', () => {
        withConfig(true);
        render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);
        expect(screen.getByTestId('tools-menu-count')).toHaveTextContent('1');
      });

      it("follows the user's own switch over the config", () => {
        withConfig(true);
        mockUser = { personalization: { connectorDefaults: { files: false } } };
        render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);
        expect(screen.queryByTestId('tools-menu-count')).not.toBeInTheDocument();
      });

      it('also turns on the connector the data hub opened this new chat for', async () => {
        withConfig(undefined);
        const store = createStore();
        store.set(newChatExtraConnectorAtom, { serverName: 'files', at: Date.now() });
        rtlRender(
          <QueryClientProvider client={new QueryClient()}>
            <RecoilRoot>
              <JotaiProvider store={store}>
                <ToolsMenu showBuiltinTools={false} agentId={savedAgent} />
              </JotaiProvider>
            </RecoilRoot>
          </QueryClientProvider>,
        );
        expect(await screen.findByTestId('tools-menu-count')).toHaveTextContent('1');
      });

      it('ignores a data hub request that has gone stale', () => {
        withConfig(undefined);
        const store = createStore();
        store.set(newChatExtraConnectorAtom, { serverName: 'files', at: Date.now() - 60_000 });
        rtlRender(
          <QueryClientProvider client={new QueryClient()}>
            <RecoilRoot>
              <JotaiProvider store={store}>
                <ToolsMenu showBuiltinTools={false} agentId={savedAgent} />
              </JotaiProvider>
            </RecoilRoot>
          </QueryClientProvider>,
        );
        expect(screen.queryByTestId('tools-menu-count')).not.toBeInTheDocument();
      });

      it('turns a default-off connector on for this chat only', async () => {
        withConfig(undefined);
        const user = userEvent.setup();
        render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);

        await user.click(screen.getByTestId('tools-menu-button'));
        await user.click(screen.getByRole('menuitemcheckbox', { name: 'Shared files' }));
        expect(
          await screen.findByRole('menuitemcheckbox', { name: 'Shared files', checked: true }),
        ).toBeInTheDocument();
        expect(mockUser).toEqual({ personalization: {} });
      });
    });

    it('lays a stored choice back on when the conversation is opened again', async () => {
      localStorage.setItem('LAST_MCP_DISABLED_test-conv', JSON.stringify(['files']));
      const user = userEvent.setup();
      render(<ToolsMenu showBuiltinTools={false} agentId={savedAgent} />);

      await user.click(screen.getByTestId('tools-menu-button'));
      expect(
        await screen.findByRole('menuitemcheckbox', { name: 'Shared files', checked: false }),
      ).toBeInTheDocument();
    });
  });
});

describe('getAgentServerNames', () => {
  it('reads the connectors from the agent MCP tool keys, resolving delimiter-bearing names', () => {
    const tools = ['web_search', 'run_mcp_foo_mcp_bar', 'sys__all__sys_mcp_docs', 'x_mcp_gone'];

    expect(getAgentServerNames(tools, ['bar', 'foo_mcp_bar', 'docs'])).toEqual(
      new Set(['foo_mcp_bar', 'docs']),
    );
  });
});
