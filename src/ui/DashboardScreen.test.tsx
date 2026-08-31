import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { DashboardScreen } from './DashboardScreen';

const useDashboardMock = vi.fn();
vi.mock('../hooks/useDashboard', () => ({ useDashboard: (...a: unknown[]) => useDashboardMock(...a) }));

function renderScreen() {
  return renderWithClient(
    <MemoryRouter initialEntries={['/console']}>
      <Routes>
        <Route path="/console" element={<DashboardScreen />} />
        <Route path="/console/agents/new" element={<div>new wizard</div>} />
        <Route path="/console/agents" element={<div>agents list</div>} />
        <Route path="/console/runs" element={<div>runs list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const base = { overview: undefined, isLoading: false, isError: false, connected: true, refetch: vi.fn() };

describe('DashboardScreen', () => {
  beforeEach(() => {
    useDashboardMock.mockReset();
  });
  it('加载中给状态提示', () => {
    useDashboardMock.mockReturnValue({ ...base, isLoading: true });
    renderScreen();
    expect(screen.getByRole('status')).toHaveTextContent('正在加载首页');
  });
  it('加载失败给重试', async () => {
    const refetch = vi.fn();
    useDashboardMock.mockReturnValue({ ...base, isError: true, refetch });
    renderScreen();
    expect(screen.getByRole('alert')).toHaveTextContent('连不上 agent-compose');
    await userEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(refetch).toHaveBeenCalled();
  });
  it('四块数值渲染 + 实时指示', async () => {
    useDashboardMock.mockReturnValue({
      ...base,
      overview: { runs: { runningCount: 2, recentCount: 5, attentionCount: 0 }, updatedAt: undefined },
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText('运行中的 AI 助手')).toBeInTheDocument());
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('今日运行次数')).toBeInTheDocument();
    expect(screen.getByText('实时')).toBeInTheDocument();
    expect(screen.getByText('最近运行一切正常。')).toBeInTheDocument();
  });
  it('attentionCount>0 渲染人话告警 + 查看日志跳运行记录', async () => {
    useDashboardMock.mockReturnValue({
      ...base,
      overview: { runs: { runningCount: 0, recentCount: 0, attentionCount: 2 }, updatedAt: undefined },
    });
    renderScreen();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('有 2 次运行出了点问题'));
    await userEvent.click(screen.getByRole('button', { name: '查看日志' }));
    await waitFor(() => expect(screen.getByText('runs list')).toBeInTheDocument());
  });
  it('attentionCount=1 单数文案', async () => {
    useDashboardMock.mockReturnValue({
      ...base,
      overview: { runs: { runningCount: 0, recentCount: 0, attentionCount: 1 }, updatedAt: undefined },
    });
    renderScreen();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('有 1 次运行出了点问题'));
  });
  it('快捷入口跳转', async () => {
    useDashboardMock.mockReturnValue(base);
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: /新建 AI 助手/ }));
    await waitFor(() => expect(screen.getByText('new wizard')).toBeInTheDocument());
  });
});
