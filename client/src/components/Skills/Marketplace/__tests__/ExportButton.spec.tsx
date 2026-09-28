import React from 'react';
import { dataService } from 'librechat-data-provider';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ExportButton from '../ExportButton';

const mockShowToast = jest.fn();

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  useToastContext: () => ({ showToast: mockShowToast }),
}));
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, unknown>) =>
    options ? `${key}:${JSON.stringify(options)}` : key,
}));
jest.mock('librechat-data-provider', () => ({
  dataService: { exportSkill: jest.fn(), exportSkillPack: jest.fn() },
}));

const exportSkill = dataService.exportSkill as jest.Mock;
const exportSkillPack = dataService.exportSkillPack as jest.Mock;

describe('ExportButton', () => {
  const createObjectURL = jest.fn(() => 'blob:zip');
  const revokeObjectURL = jest.fn();
  let clickedDownloads: string[];

  beforeEach(() => {
    jest.clearAllMocks();
    clickedDownloads = [];
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clickedDownloads.push(`${this.download}@${this.href}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('downloads the skill zip under the given file name', async () => {
    const blob = new Blob(['zip'], { type: 'application/zip' });
    exportSkill.mockResolvedValue({ data: blob });
    render(<ExportButton kind="skill" id="skill-1" fileName="weekly-report.zip" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'com_skills_export' }));
    });

    expect(exportSkill).toHaveBeenCalledWith('skill-1');
    expect(exportSkillPack).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickedDownloads).toEqual(['weekly-report.zip@blob:zip']);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:zip');
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'success',
      message: 'com_skills_export_done:{"file":"weekly-report.zip"}',
    });
  });

  it('asks the pack endpoint for a pack', async () => {
    exportSkillPack.mockResolvedValue({ data: new Blob(['zip']) });
    render(<ExportButton kind="pack" id="pack-1" fileName="month-end.zip" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'com_skills_export' }));
    });

    expect(exportSkillPack).toHaveBeenCalledWith('pack-1');
    expect(exportSkill).not.toHaveBeenCalled();
    expect(clickedDownloads).toEqual(['month-end.zip@blob:zip']);
  });

  it('shows an error and saves nothing when the server refuses', async () => {
    exportSkill.mockRejectedValue(new Error('403'));
    render(<ExportButton kind="skill" id="skill-1" fileName="weekly-report.zip" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'com_skills_export' }));
    });

    expect(clickedDownloads).toEqual([]);
    expect(mockShowToast).toHaveBeenCalledWith({ status: 'error', message: 'com_ui_error' });
    expect(screen.getByRole('button', { name: 'com_skills_export' })).not.toBeDisabled();
  });

  it('disables itself while the zip is being prepared', async () => {
    let finish: (value: { data: Blob }) => void = () => undefined;
    exportSkill.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ExportButton kind="skill" id="skill-1" fileName="weekly-report.zip" />);
    const button = screen.getByRole('button', { name: 'com_skills_export' });

    await act(async () => {
      fireEvent.click(button);
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      finish({ data: new Blob(['zip']) });
    });
    expect(button).not.toBeDisabled();
  });
});
