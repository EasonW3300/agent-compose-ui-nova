import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAgents } from './useAgents';

const listProjectsMock = vi.fn();
const getProjectMock = vi.fn();
const getSchedulerNextFireMock = vi.fn();

vi.mock('../api/projects', () => ({
  listProjects: (...a: unknown[]) => listProjectsMock(...a),
  getProject: (...a: unknown[]) => getProjectMock(...a),
  getSchedulerNextFire: (...a: unknown[]) => getSchedulerNextFireMock(...a),
  projectRefById: (id: string) => ({ case: 'projectId', value: id }),
}));

vi.mock('../api/connection', () => ({
  loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useAgents', () => {
  beforeEach(() => {
    listProjectsMock.mockReset();
    getProjectMock.mockReset();
    getSchedulerNextFireMock.mockReset();
  });
  it('聚合 ListProjects+GetProject+GetScheduler 成 AgentCard 列表', async () => {
    listProjectsMock.mockResolvedValue([{ projectId: 'p1', name: 'proj' }]);
    getProjectMock.mockResolvedValue({
      summary: { projectId: 'p1', name: 'proj' },
      agents: [{ agentName: 'a1', provider: 'claude', enabled: true, schedulerEnabled: true, displayName: '小助手', latestRun: undefined, currentRun: undefined }],
      schedulers: [{ agentName: 'a1' }],
    });
    getSchedulerNextFireMock.mockResolvedValue(new Date('2026-08-30T09:00:00Z'));
    const { result } = renderHook(() => useAgents(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0]).toMatchObject({ projectId: 'p1', agentName: 'a1', provider: 'claude' });
    expect(getProjectMock).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, { case: 'projectId', value: 'p1' }, true);
    expect(getSchedulerNextFireMock).toHaveBeenCalled();
  });
  it('无项目时返回空数组', async () => {
    listProjectsMock.mockResolvedValue([]);
    const { result } = renderHook(() => useAgents(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });
  it('单个项目 GetProject 失败只跳过该项目，不影响其余卡片', async () => {
    listProjectsMock.mockResolvedValue([
      { projectId: 'p1', name: 'proj' },
      { projectId: 'p2', name: 'broken' },
    ]);
    getProjectMock.mockImplementation(async (_s: unknown, ref: { value: string }) =>
      ref.value === 'p2'
        ? Promise.reject(new Error('project gone'))
        : Promise.resolve({
            summary: { projectId: 'p1', name: 'proj' },
            agents: [{ agentName: 'a1', provider: 'claude', enabled: true, schedulerEnabled: true, displayName: '小助手', latestRun: undefined, currentRun: undefined }],
            schedulers: [{ agentName: 'a1' }],
          }),
    );
    getSchedulerNextFireMock.mockResolvedValue(null);
    const { result } = renderHook(() => useAgents(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0]).toMatchObject({ projectId: 'p1', agentName: 'a1' });
    expect(getProjectMock).toHaveBeenCalledTimes(2);
  });
});
