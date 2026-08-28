import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { AgentListScreen } from './AgentListScreen';

const useAgentsMock = vi.fn();
const removeProjectMock = vi.fn();
const startAgentRunMock = vi.fn();
const setAgentEnabledMock = vi.fn();

vi.mock('../hooks/useAgents', () => ({ useAgents: (...a: unknown[]) => useAgentsMock(...a) }));
vi.mock('../api/projects', () => ({
  removeProject: (...a: unknown[]) => removeProjectMock(...a),
  startAgentRun: (...a: unknown[]) => startAgentRunMock(...a),
  setAgentEnabled: (...a: unknown[]) => setAgentEnabledMock(...a),
  projectRefByName: (name: string) => ({ case: 'name', value: name }),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

const card = {
  key: 'p1:a1', projectId: 'p1', agentName: 'a1', projectName: 'proj',
  displayName: '我的日报', provider: 'claude', status: 'idle', schedulerEnabled: true,
  nextFireAt: new Date('2026-08-30T09:00:00Z'),
  latestRun: { runId: 'r1', statusLabel: '已完成', at: null },
};

function renderScreen() {
  return renderWithClient(
    <MemoryRouter initialEntries={['/console/agents']}>
      <AgentListScreen />
    </MemoryRouter>,
  );
}

describe('AgentListScreen', () => {
  beforeEach(() => {
    useAgentsMock.mockReset();
    removeProjectMock.mockReset().mockResolvedValue(undefined);
    startAgentRunMock.mockReset().mockResolvedValue({ runId: 'r9' });
    setAgentEnabledMock.mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('加载中给状态提示', () => {
    useAgentsMock.mockReturnValue({ data: undefined, isLoading: true });
    renderScreen();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
  it('有 agent 时渲染卡片网格', async () => {
    useAgentsMock.mockReturnValue({ data: [card], isLoading: false });
    renderScreen();
    await waitFor(() => expect(screen.getByText('我的日报')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /新建/ })).toBeInTheDocument();
  });
  it('空列表给引导文案', () => {
    useAgentsMock.mockReturnValue({ data: [], isLoading: false });
    renderScreen();
    expect(screen.getByText(/还没有 AI 助手/)).toBeInTheDocument();
  });
  it('加载失败给人话错误 + 重试按钮', () => {
    useAgentsMock.mockReturnValue({ data: undefined, isError: true, refetch: vi.fn() });
    renderScreen();
    expect(screen.getByText(/加载失败/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
  });
  it('点击删除进入确认，确认后调 removeProject', async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const user = userEvent.setup();
    useAgentsMock.mockReturnValue({ data: [card], isLoading: false });
    renderScreen();
    await user.click(screen.getByRole('button', { name: /删除/ }));
    await user.click(screen.getByRole('button', { name: /确认删除/ }));
    await waitFor(() => expect(removeProjectMock).toHaveBeenCalled());
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agents'] }));
  });
  it('点击立即运行调 startAgentRun', async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const user = userEvent.setup();
    useAgentsMock.mockReturnValue({ data: [card], isLoading: false });
    renderScreen();
    await user.click(screen.getByRole('button', { name: /立即运行/ }));
    await waitFor(() => expect(startAgentRunMock).toHaveBeenCalled());
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agents'] }));
  });
});
