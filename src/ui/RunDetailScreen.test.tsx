import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { RunEventKind, RunSource, RunStatus } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { RunDetailScreen } from './RunDetailScreen';

const getRunMock = vi.fn();
const listRunEventsMock = vi.fn();
const stopRunMock = vi.fn();
vi.mock('../api/runs', () => ({
  getRun: (...a: unknown[]) => getRunMock(...a),
  listRunEvents: (...a: unknown[]) => listRunEventsMock(...a),
  stopRun: (...a: unknown[]) => stopRunMock(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

const useRunLogsMock = vi.fn();
vi.mock('../hooks/useRunLogs', () => ({ useRunLogs: (...a: unknown[]) => useRunLogsMock(...a) }));

function summary(status: RunStatus) {
  return {
    runId: 'r1', projectId: 'p1', projectName: 'proj', projectRevision: 0n, agentId: 'ag',
    agentName: 'my-report', source: RunSource.MANUAL, schedulerId: '', triggerId: '',
    status, exitCode: 0, error: '', durationMs: 0n, warnings: [],
    sandboxId: '', runShortId: 'abc123', sandboxShortId: '', schedulerRunId: '',
  };
}

function renderScreen(runId = 'r1') {
  return renderWithClient(
    <MemoryRouter initialEntries={[`/console/runs/${runId}`]}>
      <Routes>
        <Route path="/console/runs/:runId" element={<RunDetailScreen />} />
        <Route path="/console/runs" element={<div>runs list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RunDetailScreen', () => {
  beforeEach(() => {
    getRunMock.mockReset().mockResolvedValue({ summary: summary(RunStatus.RUNNING), prompt: '整理日志', output: '', resultJson: '', logsPath: '', artifactsDir: '', cleanupError: '', driver: '', imageRef: '', warnings: [], errorStack: '' });
    listRunEventsMock.mockReset().mockResolvedValue({
      events: [
        { id: 'e1', runId: 'r1', seq: 1n, kind: RunEventKind.STATUS, text: '开始运行', agent: 'my-report', name: '', payloadJson: '', success: true, exitCode: 0, stopReason: '', createdAt: undefined },
      ],
      total: 1,
      historyAvailable: true,
    });
    stopRunMock.mockReset().mockResolvedValue(undefined);
    useRunLogsMock.mockReset().mockReturnValue({
      lines: [{ id: 0, text: '第 1 行' }],
      status: null, connected: true, error: null, reset: vi.fn(),
    });
  });
  it('加载中给状态提示', () => {
    getRunMock.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByRole('status')).toHaveTextContent('正在加载运行详情');
  });
  it('找不到运行给人话 + 返回运行记录', async () => {
    getRunMock.mockResolvedValue(undefined);
    renderScreen();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('找不到这次运行'));
    await userEvent.click(screen.getByRole('button', { name: /返回运行记录/ }));
    await waitFor(() => expect(screen.getByText('runs list')).toBeInTheDocument());
  });
  it('渲染标题/状态标签/日志行/事件时间线', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('my-report')).toBeInTheDocument());
    expect(screen.getByText('正在工作')).toBeInTheDocument(); // runStatusLabel(RUNNING)
    expect(screen.getByText('第 1 行')).toBeInTheDocument();   // 日志
    expect(screen.getByText('开始运行')).toBeInTheDocument();  // 事件 text
    expect(screen.getByText('状态变化')).toBeInTheDocument();  // describeRunEventKind(STATUS)
  });
  it('非终态显示停止按钮；确认后调 StopRun 并关闭弹层', async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: /停止这次运行/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /停止这次运行/ }));
    await user.click(screen.getByRole('button', { name: /确认停止/ }));
    await waitFor(() => expect(stopRunMock).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' }, 'r1', expect.stringContaining('stop'),
    ));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('终态（SUCCEEDED）不显示停止按钮', async () => {
    getRunMock.mockResolvedValue({ summary: summary(RunStatus.SUCCEEDED), prompt: '', output: '', resultJson: '', logsPath: '', artifactsDir: '', cleanupError: '', driver: '', imageRef: '', warnings: [], errorStack: '' });
    renderScreen();
    await waitFor(() => expect(screen.getByText('已完成')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /停止这次运行/ })).not.toBeInTheDocument();
  });
});
