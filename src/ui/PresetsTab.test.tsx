import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { PresetsTab } from './PresetsTab';

const mocks = {
  getWorkspacePresets: vi.fn(),
  createWorkspacePreset: vi.fn(),
  updateWorkspacePreset: vi.fn(),
  deleteWorkspacePreset: vi.fn(),
};
vi.mock('../api/settings', () => ({
  getWorkspacePresets: (...a: unknown[]) => mocks.getWorkspacePresets(...a),
  createWorkspacePreset: (...a: unknown[]) => mocks.createWorkspacePreset(...a),
  updateWorkspacePreset: (...a: unknown[]) => mocks.updateWorkspacePreset(...a),
  deleteWorkspacePreset: (...a: unknown[]) => mocks.deleteWorkspacePreset(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

function preset(id: string, name: string, type: string) {
  return { id, name, type, configJson: '' };
}

describe('PresetsTab', () => {
  beforeEach(() => {
    mocks.getWorkspacePresets.mockReset().mockResolvedValue([preset('p1', '我的工作台', 'git'), preset('p2', '空开始', 'empty')]);
    mocks.createWorkspacePreset.mockReset().mockResolvedValue(undefined);
    mocks.updateWorkspacePreset.mockReset().mockResolvedValue(undefined);
    mocks.deleteWorkspacePreset.mockReset().mockResolvedValue(undefined);
  });
  it('列表渲染名称与类型人话', async () => {
    renderWithClient(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('我的工作台')).toBeInTheDocument());
    expect(screen.getByText('Git 仓库')).toBeInTheDocument();
    expect(screen.getByText('空工作区')).toBeInTheDocument();
  });
  it('新建：填 name/type 保存调 createWorkspacePreset 并刷新', async () => {
    const user = userEvent.setup();
    renderWithClient(<PresetsTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: /新建预设/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /新建预设/ }));
    await user.type(screen.getByLabelText('预设名称'), '共享工作区');
    await user.selectOptions(screen.getByLabelText('类型'), 'git');
    await user.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => expect(mocks.createWorkspacePreset).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      { name: '共享工作区', type: 'git', configJson: '' },
    ));
    await waitFor(() => expect(mocks.getWorkspacePresets).toHaveBeenCalledTimes(2));
  });
  it('删除前必须确认，确认后调 deleteWorkspacePreset', async () => {
    const user = userEvent.setup();
    renderWithClient(<PresetsTab />);
    // mock 有两个预设 → 两个「删除」按钮，getByRole 会多匹配抛错；取第一个（p1）
    await waitFor(() => expect(screen.getAllByRole('button', { name: '删除' }).length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: '删除' })[0]);
    expect(mocks.deleteWorkspacePreset).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(mocks.deleteWorkspacePreset).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, 'p1'));
  });
  it('加载失败给重试', async () => {
    mocks.getWorkspacePresets.mockReset().mockRejectedValueOnce(new Error('down'));
    renderWithClient(<PresetsTab />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('连不上 agent-compose'));
  });
});
