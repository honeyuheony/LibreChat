import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FileSources } from 'librechat-data-provider';
import type { ExtendedFile } from '~/common';
import FileRow from '../FileRow';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/data-provider', () => ({
  useDeleteFilesMutation: () => ({ mutateAsync: jest.fn() }),
}));

const mockDeleteFile = jest.fn();
jest.mock('~/hooks/Files', () => ({
  useFileDeletion: () => ({ deleteFile: mockDeleteFile }),
}));

const textFile = (overrides: Partial<ExtendedFile> = {}): ExtendedFile => ({
  file_id: 'report',
  type: 'text/plain',
  filename: '2026-09_월간동향보고서.md',
  filepath: '/uploads/user123/report.md',
  progress: 1,
  size: 2048,
  source: FileSources.local,
  ...overrides,
});

const imageFile = (overrides: Partial<ExtendedFile> = {}): ExtendedFile =>
  textFile({
    file_id: 'chart',
    type: 'image/png',
    filename: 'chart.png',
    preview: 'blob:http://localhost:3080/chart',
    filepath: '/images/user123/chart.png',
    ...overrides,
  });

const renderChips = (
  files: ExtendedFile[],
  props: Partial<React.ComponentProps<typeof FileRow>> = {},
) =>
  render(
    <FileRow
      files={new Map(files.map((file) => [file.file_id, file]))}
      setFiles={jest.fn()}
      setFilesLoading={jest.fn()}
      variant="chip"
      {...props}
    />,
  );

describe('FileRow chip variant', () => {
  beforeEach(() => {
    mockDeleteFile.mockClear();
  });

  it('draws each attachment as a pill with its name', () => {
    renderChips([textFile()]);

    const chip = screen.getByTestId('composer-file-chip');
    expect(chip).toHaveTextContent('2026-09_월간동향보고서.md');
    expect(chip).toHaveClass('rounded-full', 'border-border-brand', 'bg-surface-brand-subtle');
  });

  it('removes the attachment from its pill', async () => {
    const file = textFile();
    renderChips([file]);

    const removeButton = screen.getByRole('button', { name: /com_ui_attach_remove/ });
    expect(removeButton).toHaveAccessibleName('com_ui_attach_remove 2026-09_월간동향보고서.md');
    await userEvent.click(removeButton);

    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
    expect(mockDeleteFile).toHaveBeenCalledWith(expect.objectContaining({ file }));
  });

  it('marks a pill busy only while its upload runs', () => {
    renderChips([textFile({ file_id: 'a', progress: 0.4 }), textFile({ file_id: 'b' })]);

    const [uploading, uploaded] = screen.getAllByTestId('composer-file-chip');
    expect(uploading).toHaveAttribute('aria-busy', 'true');
    expect(uploaded).not.toHaveAttribute('aria-busy');
  });

  it('announces that an attachment is loading while it uploads', () => {
    renderChips([textFile({ progress: 0.4 })]);

    const status = screen.queryByRole('status');
    expect(status).not.toBeNull();
    if (status == null) {
      return;
    }
    expect(status).toHaveTextContent('com_ui_loading');
  });

  it('shows the local filename while its upload is pending', () => {
    renderChips([
      textFile({
        filename: undefined,
        file: new File(['report'], 'pending-report.md'),
        progress: 0.4,
      }),
    ]);

    expect(screen.getByTestId('composer-file-chip')).toHaveTextContent('pending-report.md');
  });

  it('opens a full-size preview from the image filename', async () => {
    renderChips([imageFile()]);

    const filename = screen.queryByRole('button', { name: 'chart.png' });
    expect(filename).not.toBeNull();
    if (filename == null) {
      return;
    }
    await userEvent.click(filename);

    expect(await screen.findByRole('img', { name: 'Preview image' })).toHaveAttribute(
      'src',
      'blob:http://localhost:3080/chart',
    );
  });

  it('opens a full-size preview from an uploaded image pill', async () => {
    renderChips([imageFile()]);

    await userEvent.click(screen.getByRole('button', { name: /in full size/ }));

    expect(await screen.findByRole('img', { name: 'Preview image' })).toHaveAttribute(
      'src',
      'blob:http://localhost:3080/chart',
    );
  });

  it('opens the paste editor from a pasted-text pill', async () => {
    const onEditPastedText = jest.fn();
    const file = textFile({ filename: 'pasted-text.txt' });
    renderChips([file], { isPastedTextFile: () => true, onEditPastedText });

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_pasted_text_edit_chip' }));

    expect(onEditPastedText).toHaveBeenCalledWith(file);
  });

  it('moves a pasted text back into the message from its pill', async () => {
    const onMovePastedTextInline = jest.fn();
    const file = textFile({ filename: 'pasted-text.txt' });
    renderChips([file], {
      isPastedTextFile: () => true,
      onEditPastedText: jest.fn(),
      onMovePastedTextInline,
    });

    await userEvent.click(screen.getByRole('button', { name: 'com_ui_pasted_text_move_inline' }));

    expect(onMovePastedTextInline).toHaveBeenCalledWith(file);
  });
});
