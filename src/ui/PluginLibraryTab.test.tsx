import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { PluginLibraryTab } from './PluginLibraryTab';

const mocks = {
  listCapabilitySets: vi.fn(),
  getCapabilityCatalog: vi.fn(),
  getCapabilityStatus: vi.fn(),
  listProjects: vi.fn(),
  getProject: vi.fn(),
};
vi.mock('../api/resources', () => ({
  listCapabilitySets: (...a: unknown[]) => mocks.listCapabilitySets(...a),
  getCapabilityCatalog: (...a: unknown[]) => mocks.getCapabilityCatalog(...a),
  getCapabilityStatus: (...a: unknown[]) => mocks.getCapabilityStatus(...a),
}));
vi.mock('../api/projects', () => ({
  listProjects: (...a: unknown[]) => mocks.listProjects(...a),
  getProject: (...a: unknown[]) => mocks.getProject(...a),
  projectRefById: (id: string) => ({ id }),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

const CATALOG = { capsetId: 'web', name: 'Web 能力', description: '', methods: [{ methodFullName: 'fetch', enabled: true }] };

describe('PluginLibraryTab', () => {
  beforeEach(() => {
    mocks.listCapabilitySets.mockReset().mockResolvedValue([
      { id: 'web', name: 'Web 能力', description: '访问网页', enabled: true },
      { id: 'code', name: '代码能力', description: '读写代码', enabled: false },
    ]);
    mocks.getCapabilityCatalog.mockReset().mockResolvedValue(CATALOG);
    mocks.getCapabilityStatus.mockReset().mockResolvedValue({ configured: true, ok: true });
    mocks.listProjects.mockReset().mockResolvedValue([{ projectId: 'p1' }]);
    mocks.getProject.mockReset().mockResolvedValue({
      summary: { projectId: 'p1', name: 'proj' },
      spec: { agents: [{ name: 'my-report', displayName: '我的日报', mcpServers: [{ name: 'github' }], skills: [{ name: 'code' }] }] },
    });
  });
  it('渲染技能包列表 + 在用汇总', async () => {
    renderWithClient(<PluginLibraryTab />);
    await waitFor(() => expect(screen.getByText('Web 能力')).toBeInTheDocument());
    expect(screen.getByText('已启用')).toBeInTheDocument();
    expect(screen.getByText('代码能力')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('在用插件与技能')).toBeInTheDocument());
    expect(screen.getByText('github')).toBeInTheDocument();
    expect(screen.getByText('我的日报')).toBeInTheDocument();
  });
  it('展开技能包加载能力目录', async () => {
    const user = userEvent.setup();
    renderWithClient(<PluginLibraryTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Web 能力/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Web 能力/ }));
    await waitFor(() => expect(screen.getByText('fetch')).toBeInTheDocument());
    expect(mocks.getCapabilityCatalog).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, 'web');
  });
});
