import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { VolumesTab } from './VolumesTab';

const mocks = { listVolumes: vi.fn(), createVolume: vi.fn(), removeVolume: vi.fn(), pruneVolumes: vi.fn() };
vi.mock('../api/resources', () => ({
  listVolumes: (...a: unknown[]) => mocks.listVolumes(...a),
  createVolume: (...a: unknown[]) => mocks.createVolume(...a),
  removeVolume: (...a: unknown[]) => mocks.removeVolume(...a),
  pruneVolumes: (...a: unknown[]) => mocks.pruneVolumes(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

const v = { name: 'data', driver: 'local', path: '/tmp/d', labels: [] };

describe('VolumesTab', () => {
  beforeEach(() => {
    mocks.listVolumes.mockReset().mockResolvedValue([v]);
    mocks.createVolume.mockReset().mockResolvedValue(undefined);
    mocks.removeVolume.mockReset().mockResolvedValue(undefined);
    mocks.pruneVolumes.mockReset().mockResolvedValue([]);
  });
  it('列表渲染 name/driver/path', async () => {
    renderWithClient(<VolumesTab />);
    await waitFor(() => expect(screen.getByText('data')).toBeInTheDocument());
    expect(screen.getByText('local')).toBeInTheDocument();
    expect(screen.getByText('/tmp/d')).toBeInTheDocument();
  });
  it('新建调 createVolume 并刷新', async () => {
    const user = userEvent.setup();
    renderWithClient(<VolumesTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: /新建数据卷/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /新建数据卷/ }));
    await user.type(screen.getByLabelText('名称'), 'vol2');
    await user.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => expect(mocks.createVolume).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      { name: 'vol2', driver: 'local' },
    ));
    await waitFor(() => expect(mocks.listVolumes).toHaveBeenCalledTimes(2));
  });
  it('单个删除二次确认后才调 removeVolume', async () => {
    const user = userEvent.setup();
    renderWithClient(<VolumesTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(mocks.removeVolume).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(mocks.removeVolume).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, 'data'));
  });
  it('Prune 二次确认 + 弹层展示人话后果文案', async () => {
    const user = userEvent.setup();
    renderWithClient(<VolumesTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: /清理未使用的卷/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /清理未使用的卷/ }));
    expect(screen.getByText(/未被任何助手使用的数据卷/)).toBeInTheDocument();
    expect(mocks.pruneVolumes).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认清理' }));
    await waitFor(() => expect(mocks.pruneVolumes).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }));
  });
});
