import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { RunSource, RunStatus } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { RunsScreen } from './RunsScreen';

const listRunsMock = vi.fn();
vi.mock('../api/runs', () => ({ listRuns: (...a: unknown[]) => listRunsMock(...a) }));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

function summary(over: Record<string, unknown> = {}) {
  return {
    runId: 'r1', projectId: 'p1', projectName: 'proj', projectRevision: 0n, agentId: 'ag',
    agentName: 'my-report', source: RunSource.MANUAL, schedulerId: '', triggerId: '',
    status: RunStatus.RUNNING, exitCode: 0, error: '', durationMs: 0n, warnings: [],
    sandboxId: '', runShortId: 'abc123', sandboxShortId: '', schedulerRunId: '', ...over,
  };
}

function renderScreen() {
  return renderWithClient(
    <MemoryRouter initialEntries={['/console/runs']}>
      <Routes>
        <Route path="/console/runs" element={<RunsScreen />} />
        <Route path="/console/runs/:runId" element={<div>run detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RunsScreen', () => {
  beforeEach(() => {
    listRunsMock.mockReset().mockResolvedValue([summary()]);
  });
  it('加载中给状态提示', () => {
    listRunsMock.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByRole('status')).toHaveTextContent('正在加载运行记录');
  });
  it('加载失败给重试（触发 invalidate 重查）', async () => {
    listRunsMock.mockRejectedValueOnce(new Error('down')).mockResolvedValue([summary()]);
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('连不上 agent-compose'));
    await user.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(listRunsMock).toHaveBeenCalledTimes(2));
  });
  it('空列表给引导文案', async () => {
    listRunsMock.mockResolvedValue([]);
    renderScreen();
    await waitFor(() => expect(screen.getByText(/还没有运行记录/)).toBeInTheDocument());
  });
  it('表格渲染各列（助手/来源/状态/耗时/开始时间）', async () => {
    listRunsMock.mockResolvedValue([
      summary({
        runId: 'r1', agentName: 'my-report', source: RunSource.SCHEDULER,
        status: RunStatus.SUCCEEDED, durationMs: 90_000n,
        startedAt: { seconds: 1785293700n, nanos: 0 },
      }),
    ]);
    renderScreen();
    await waitFor(() => expect(screen.getByText('my-report')).toBeInTheDocument());
    expect(screen.getByText('定时触发')).toBeInTheDocument();
    expect(screen.getByText('已完成')).toBeInTheDocument();
    expect(screen.getByText('1 分 30 秒')).toBeInTheDocument();
  });
  it('点行跳运行详情', async () => {
    listRunsMock.mockResolvedValue([summary({ runId: 'r9' })]);
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText('my-report')).toBeInTheDocument());
    await user.click(screen.getByText('my-report'));
    await waitFor(() => expect(screen.getByText('run detail')).toBeInTheDocument());
  });
});
