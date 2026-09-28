import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import useFolderUpload from '../useFolderUpload';

const mockShowToast = jest.fn();
jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));
jest.mock('~/hooks/useLocalize', () => ({
  __esModule: true,
  default: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${values[0]}` : key,
}));

const inFolder = (path: string, type = '') => {
  const file = new File(['x'], path.split('/').pop() ?? path, { type });
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
};

const changeEvent = (files: File[]) => {
  const target = { files, value: 'C:\\fakepath' };
  return { target, stopPropagation: jest.fn() } as unknown as React.ChangeEvent<HTMLInputElement>;
};

const setup = () => {
  const handleFiles = jest.fn().mockResolvedValue(true);
  const setFilesLoading = jest.fn();
  const { result } = renderHook(() =>
    useFolderUpload({
      supportedMimeTypes: [/^application\/pdf$/, /^application\/x-hwp$/],
      handleFiles,
      setFilesLoading,
    }),
  );
  return { result, handleFiles, setFilesLoading };
};

describe('useFolderUpload', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uploads only the allowed files of the folder in one batch and reports the skipped count', () => {
    const { result, handleFiles, setFilesLoading } = setup();
    const event = changeEvent([
      inFolder('plans/a.pdf', 'application/pdf'),
      inFolder('plans/.DS_Store'),
      inFolder('plans/sub/b.hwp'),
      inFolder('plans/setup.exe', 'application/x-msdownload'),
    ]);

    act(() => result.current.onFolderChange(event));

    expect(handleFiles).toHaveBeenCalledTimes(1);
    const [uploaded] = handleFiles.mock.calls[0] as [File[]];
    expect(uploaded.map((file) => file.name)).toEqual(['a.pdf', 'b.hwp']);
    expect(setFilesLoading).toHaveBeenCalledWith(true);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_upload_folder_skipped:2', status: 'warning' }),
    );
    expect(event.target.value).toBe('');
  });

  it('uploads without a notice when every file is allowed', () => {
    const { result, handleFiles } = setup();
    act(() => result.current.onFolderChange(changeEvent([inFolder('p/a.pdf', 'application/pdf')])));
    expect(handleFiles).toHaveBeenCalledTimes(1);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('sends nothing when the folder holds no allowed file', () => {
    const { result, handleFiles, setFilesLoading } = setup();
    act(() => result.current.onFolderChange(changeEvent([inFolder('p/setup.exe')])));
    expect(handleFiles).not.toHaveBeenCalled();
    expect(setFilesLoading).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'com_ui_upload_folder_skipped:1' }),
    );
  });
});
