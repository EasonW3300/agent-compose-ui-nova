import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { SandboxesTab } from './SandboxesTab';

const mocks = {
  listSandboxes: vi.fn(), stopSandbox: vi.fn(), resumeSandbox: vi.fn(), removeSandbox: vi.fn(), pruneSandboxes: vi.fn(),
  listImages: vi.fn(), removeImage: vi.fn(),
  listCaches: vi.fn(), removeCache: vi.fn(), pruneCaches: vi.fn(),
};
vi.mock('../api/resources', () => ({
  listSandboxes: (...a: unknown[]) => mocks.listSandboxes(...a),
  stopSandbox: (...a: unknown[]) => mocks.stopSandbox(...a),
  resumeSandbox: (...a: unknown[]) => mocks.resumeSandbox(...a),
  removeSandbox: (...a: unknown[]) => mocks.removeSandbox(...a),
  pruneSandboxes: (...a: unknown[]) => mocks.pruneSandboxes(...a),
  listImages: (...a: unknown[]) => mocks.listImages(...a),
  removeImage: (...a: unknown[]) => mocks.removeImage(...a),
  listCaches: (...a: unknown[]) => mocks.listCaches(...a),
  removeCache: (...a: unknown[]) => mocks.removeCache(...a),
  pruneCaches: (...a: unknown[]) => mocks.pruneCaches(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));
vi.mock('../domain/resourceView', () => ({
  describeSandboxStatus: (st: number) => (st === 2 ? '运行中' : '已停止'),
  describeCacheDomain: () => '镜像仓库',
  DANGEROUS_ACTIONS: { removeSandbox: '删除后工作台会被移除。', removeImage: '镜像会被移除。', removeCache: '缓存会被清理。', pruneSandboxes: '清理所有已停止的工作台。', pruneCaches: '清理所有未使用的缓存。' },
}));

const S = { baseUrl: '', authToken: '' };
const RUNNING = { sandboxId: 'sb1', status: 2, driver: 'docker' };
const img = { imageRef: 'img/foo:latest' };
const cache = { cacheId: 'c1', domain: 1 };

describe('SandboxesTab', () => {
  beforeEach(() => {
    mocks.listSandboxes.mockReset().mockResolvedValue([RUNNING]);
    mocks.stopSandbox.mockReset().mockResolvedValue(undefined);
    mocks.resumeSandbox.mockReset().mockResolvedValue(undefined);
    mocks.removeSandbox.mockReset().mockResolvedValue(undefined);
    mocks.pruneSandboxes.mockReset().mockResolvedValue(undefined);
    mocks.listImages.mockReset().mockResolvedValue([img]);
    mocks.removeImage.mockReset().mockResolvedValue(undefined);
    mocks.listCaches.mockReset().mockResolvedValue([cache]);
    mocks.removeCache.mockReset().mockResolvedValue(undefined);
    mocks.pruneCaches.mockReset().mockResolvedValue(undefined);
  });
  it('渲染沙箱状态人话 + 镜像名 + 缓存行', async () => {
    renderWithClient(<SandboxesTab />);
    await waitFor(() => expect(screen.getByText('运行中')).toBeInTheDocument());
    expect(screen.getByText('img/foo:latest')).toBeInTheDocument();
    expect(screen.getByText('镜像仓库')).toBeInTheDocument();
  });
  it('停止需二次确认，确认后才调 stopSandbox', async () => {
    const user = userEvent.setup();
    renderWithClient(<SandboxesTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '停止' }));
    expect(mocks.stopSandbox).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认停止' }));
    await waitFor(() => expect(mocks.stopSandbox).toHaveBeenCalledWith(S, 'sb1'));
  });
  it('移除沙箱二次确认 → removeSandbox', async () => {
    const user = userEvent.setup();
    renderWithClient(<SandboxesTab />);
    // 沙箱/镜像/缓存三行各有「移除」，用 getAllByRole 取第一个（沙箱行）
    await waitFor(() => expect(screen.getAllByRole('button', { name: '移除' }).length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: '移除' })[0]);
    expect(mocks.removeSandbox).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认移除' }));
    await waitFor(() => expect(mocks.removeSandbox).toHaveBeenCalledWith(S, 'sb1'));
  });
  it('清理沙箱/清理缓存二次确认 → pruneSandboxes / pruneCaches', async () => {
    const user = userEvent.setup();
    renderWithClient(<SandboxesTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: /清理已停止的工作台/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /清理已停止的工作台/ }));
    await user.click(screen.getByRole('button', { name: '确认清理' }));
    await waitFor(() => expect(mocks.pruneSandboxes).toHaveBeenCalledWith(S));
    await user.click(screen.getByRole('button', { name: /清理缓存/ }));
    await user.click(screen.getByRole('button', { name: '确认清理' }));
    await waitFor(() => expect(mocks.pruneCaches).toHaveBeenCalledWith(S));
  });
  it('移除镜像/缓存二次确认 → removeImage / removeCache', async () => {
    const user = userEvent.setup();
    renderWithClient(<SandboxesTab />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: '移除' }).length).toBeGreaterThan(1));
    const buttons = screen.getAllByRole('button', { name: '移除' });
    // DOM 顺序：沙箱行(运行中, [停止][移除]) → 镜像行[移除] → 缓存行[移除]
    await user.click(buttons[1]);
    await user.click(screen.getByRole('button', { name: '确认移除' }));
    await waitFor(() => expect(mocks.removeImage).toHaveBeenCalledWith(S, 'img/foo:latest'));
    await user.click(screen.getAllByRole('button', { name: '移除' })[2]);
    await user.click(screen.getByRole('button', { name: '确认移除' }));
    await waitFor(() => expect(mocks.removeCache).toHaveBeenCalledWith(S, 'c1'));
  });
});
