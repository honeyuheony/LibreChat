import { useAtomValue } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { SettingsTabValues } from 'librechat-data-provider';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  TUpdateWorkspacePreferencesRequest,
  TUpdateWorkspacePreferencesResponse,
  TWorkspacePreferences,
} from 'librechat-data-provider';
import type { UseMutationOptions } from '@tanstack/react-query';
import { settingsDialogTabAtom } from '~/components/Nav/Settings/state';
import UserSettings from '../index';

const mockShowToast = jest.fn();
const mockRefetch = jest.fn();
const mockPreferences: TWorkspacePreferences = {
  instructions:
    '답변은 한국어. 수치는 출처와 함께. 추측으로 빈 값을 채우지 않는다. 북한 관련 표현은 부처 표기 기준을 따른다.',
  approvalMode: 'manual',
};

type WorkspaceMutationOptions = UseMutationOptions<
  TUpdateWorkspacePreferencesResponse,
  Error,
  TUpdateWorkspacePreferencesRequest
>;

let mockPreferencesQuery: {
  data: TWorkspacePreferences | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: typeof mockRefetch;
};
let mockInstructionsMutationOptions: WorkspaceMutationOptions | undefined;
let mockApprovalModeMutationOptions: WorkspaceMutationOptions | undefined;
let mockMutationCallCount = 0;
let mockMutationError: Error | null = null;

const mockMutate = jest.fn((payload: TUpdateWorkspacePreferencesRequest) => {
  const mutationOptions =
    payload.instructions !== undefined
      ? mockInstructionsMutationOptions
      : mockApprovalModeMutationOptions;
  if (mockMutationError) {
    mutationOptions?.onError?.(mockMutationError, payload, undefined);
    return;
  }
  const response: TUpdateWorkspacePreferencesResponse = {
    updated: true,
    preferences: { ...mockPreferences, ...payload },
  };
  mutationOptions?.onSuccess?.(response, payload, undefined);
});

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider/User', () => ({
  useWorkspacePreferencesQuery: () => mockPreferencesQuery,
  useUpdateWorkspacePreferencesMutation: (options: WorkspaceMutationOptions) => {
    if (mockMutationCallCount % 2 === 0) {
      mockInstructionsMutationOptions = options;
    } else {
      mockApprovalModeMutationOptions = options;
    }
    mockMutationCallCount += 1;
    return { mutate: mockMutate, isLoading: false };
  },
}));

function SettingsTabProbe() {
  const tab = useAtomValue(settingsDialogTabAtom);
  return <span data-testid="legacy-settings-tab">{tab ?? ''}</span>;
}

function renderSettings() {
  return render(
    <MemoryRouter>
      <UserSettings />
      <SettingsTabProbe />
    </MemoryRouter>,
  );
}

describe('UserSettings', () => {
  beforeEach(() => {
    mockPreferencesQuery = {
      data: mockPreferences,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    mockInstructionsMutationOptions = undefined;
    mockApprovalModeMutationOptions = undefined;
    mockMutationCallCount = 0;
    mockMutationError = null;
    mockShowToast.mockClear();
    mockRefetch.mockClear();
    mockMutate.mockClear();
  });

  it('shows the wireframe labels, defaults, and connector link', () => {
    renderSettings();

    expect(screen.getByRole('heading', { name: 'com_nav_settings' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'com_ui_user_settings_data_integrations' }),
    ).toHaveAttribute('href', '/connectors');
    expect(
      screen.getByRole('textbox', { name: 'com_ui_user_settings_global_instructions' }),
    ).toHaveValue(mockPreferences.instructions);
    expect(screen.getByText('com_ui_user_settings_global_instructions_hint')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'com_ui_user_settings_approval_mode' }),
    ).toHaveValue('manual');
    expect(
      screen.getByRole('option', { name: 'com_ui_user_settings_approval_manual' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'com_ui_user_settings_approval_auto' }),
    ).toBeInTheDocument();
  });

  it('matches the wireframe layout for settings controls', () => {
    renderSettings();

    const note = screen.getByRole('note');
    expect(note).toHaveClass(
      'rounded-lg',
      'border-accent-primary/20',
      'bg-surface-brand-subtle',
      'text-accent-primary',
    );
    expect(note.parentElement).toHaveClass('space-y-3');
    expect(note.closest('div.mx-auto')).toHaveClass('max-w-[710px]');
    const settingsHeading = screen.getByRole('heading', { name: 'com_nav_settings' });
    expect(settingsHeading).toHaveClass('mb-2.5');
    expect(settingsHeading.closest('div.px-4')).toHaveClass('md:pt-4');

    const instructions = screen.getByRole('textbox', {
      name: 'com_ui_user_settings_global_instructions',
    });
    expect(instructions).toHaveClass('w-full', 'max-w-[520px]');
    expect(instructions.closest('section')?.classList.contains('rounded-xl')).toBe(false);
    expect(instructions.closest('section')?.classList.contains('border')).toBe(false);
    expect(screen.getByText('com_ui_user_settings_global_instructions')).toHaveClass(
      'font-normal',
      'text-text-muted',
    );
    expect(screen.getByText('com_ui_user_settings_approval_mode')).toHaveClass('text-text-muted');
    expect(screen.getByText('com_ui_user_settings_global_instructions_hint')).toHaveClass(
      'text-[13px]',
      'text-text-muted',
    );
    expect(
      screen.getByRole('link', { name: 'com_ui_user_settings_data_integrations' }),
    ).not.toHaveClass('underline');

    expect(
      screen.getByRole('combobox', { name: 'com_ui_user_settings_approval_mode' }),
    ).toHaveClass(
      'w-full',
      'max-w-[520px]',
      'bg-surface-tertiary',
      'border-border-medium',
      'rounded-lg',
      'py-[7.5px]',
      'text-[14.5px]',
    );
    expect(screen.getByRole('button', { name: 'com_ui_account_settings_more' })).toHaveClass(
      'border-t',
      'border-border-light',
      'rounded-none',
    );
  });

  it('opens the existing settings dialog from the bottom link', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_account_settings_more' }));

    expect(screen.getByTestId('legacy-settings-tab')).toHaveTextContent(SettingsTabValues.GENERAL);
  });

  it('saves changed instructions on blur and confirms the save', () => {
    renderSettings();
    const instructions = screen.getByRole('textbox', {
      name: 'com_ui_user_settings_global_instructions',
    });
    fireEvent.change(instructions, { target: { value: '새 지침' } });

    expect(mockMutate).not.toHaveBeenCalled();
    fireEvent.blur(instructions);

    expect(mockMutate).toHaveBeenCalledWith({ instructions: '새 지침' });
    expect(mockShowToast).toHaveBeenCalledWith({
      message: 'com_ui_user_settings_instructions_saved',
      status: 'success',
    });
  });

  it('keeps the instructions draft and reports a failed save', () => {
    mockMutationError = new Error('save failed');
    renderSettings();
    const instructions = screen.getByRole('textbox', {
      name: 'com_ui_user_settings_global_instructions',
    });
    fireEvent.change(instructions, { target: { value: '새 지침' } });
    fireEvent.blur(instructions);

    expect(instructions).toHaveValue('새 지침');
    expect(mockShowToast).toHaveBeenCalledWith({
      message: 'com_ui_user_settings_save_error',
      status: 'error',
    });
  });

  it('saves the approval mode immediately without a success notification', () => {
    renderSettings();
    fireEvent.change(screen.getByRole('combobox', { name: 'com_ui_user_settings_approval_mode' }), {
      target: { value: 'auto' },
    });

    expect(mockMutate).toHaveBeenCalledWith({ approvalMode: 'auto' });
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('restores the saved approval mode after a failed update', () => {
    mockMutationError = new Error('save failed');
    renderSettings();
    const approvalMode = screen.getByRole('combobox', {
      name: 'com_ui_user_settings_approval_mode',
    });
    fireEvent.change(approvalMode, { target: { value: 'auto' } });

    expect(approvalMode).toHaveValue('manual');
    expect(mockShowToast).toHaveBeenCalledWith({
      message: 'com_ui_user_settings_save_error',
      status: 'error',
    });
  });

  it('does not save unchanged instructions on blur', () => {
    renderSettings();
    fireEvent.blur(
      screen.getByRole('textbox', { name: 'com_ui_user_settings_global_instructions' }),
    );

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows a loading state before preferences arrive', () => {
    mockPreferencesQuery = {
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: mockRefetch,
    };
    renderSettings();

    expect(screen.getByRole('status', { name: 'com_ui_loading' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('offers a retry when preferences fail to load', () => {
    mockPreferencesQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    };
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_retry' }));

    expect(screen.getByRole('alert')).toHaveTextContent('com_ui_user_settings_load_error');
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
