import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { RunEventKind, RunSource, RunStatus } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { RunDetailScreen } from './RunDetailScreen';

const getRunMock = vi.fn();
const listRunEventsMock = vi.fn();
const stopRunMock = vi.fn();
const retryRunMock = vi.fn();
vi.mock('../api/runs', () => ({
  getRun: (...a: unknown[]) => getRunMock(...a),
  listRunEvents: (...a: unknown[]) => listRunEventsMock(...a),
  stopRun: (...a: unknown[]) => stopRunMock(...a),
  retryRun: (...a: unknown[]) => retryRunMock(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

const useRunLogsMock = vi.fn();
vi.mock('../hooks/useRunLogs', () => ({ useRunLogs: (...a: unknown[]) => useRunLogsMock(...a) }));

const useRunConversationMock = vi.fn();
vi.mock('../hooks/useRunConversation', () => ({
  useRunConversation: (...a: unknown[]) => useRunConversationMock(...a),
}));

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
    retryRunMock.mockReset().mockResolvedValue({ ...summary(RunStatus.RUNNING), runId: 'r2', runShortId: 'r2' });
    useRunLogsMock.mockReset().mockReturnValue({
      lines: [{ id: 0, text: '第 1 行' }],
      status: null, connected: true, error: null, reset: vi.fn(),
    });
    useRunConversationMock.mockReset().mockReturnValue({
      send: vi.fn().mockResolvedValue(undefined),
      isSending: false,
      error: null,
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
    // 事件类型筛选的 option 也会出现「状态变化」，需限定到事件行内断言
    expect(within(screen.getByText('开始运行').closest('.run-event') as HTMLElement).getByText('状态变化')).toBeInTheDocument(); // describeRunEventKind(STATUS)
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

  it('等待输入时发送回复，并把持久化事件显示为对话记录', async () => {
    const sendMock = vi.fn().mockResolvedValue(undefined);
    useRunConversationMock.mockReturnValue({ send: sendMock, isSending: false, error: null });
    getRunMock.mockResolvedValue({ summary: summary(RunStatus.WAITING_FOR_INPUT), prompt: '', output: '', resultJson: '', logsPath: '', artifactsDir: '', cleanupError: '', driver: '', imageRef: '', warnings: [], errorStack: '' });
    const user = userEvent.setup();
    renderScreen();

    await user.type(await screen.findByLabelText('回复助手'), '日志在 /workspace/log.md');
    await user.click(screen.getByRole('button', { name: '发送回复' }));

    expect(sendMock).toHaveBeenCalledWith('日志在 /workspace/log.md');
    expect(screen.getByRole('heading', { name: '对话记录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '结束任务' })).toBeInTheDocument();
  });

  it('非等待状态隐藏回复控件', async () => {
    getRunMock.mockResolvedValue({ summary: summary(RunStatus.SUCCEEDED), prompt: '', output: '', resultJson: '', logsPath: '', artifactsDir: '', cleanupError: '', driver: '', imageRef: '', warnings: [], errorStack: '' });
    renderScreen();

    await waitFor(() => expect(screen.getByText('已完成')).toBeInTheDocument());
    expect(screen.queryByLabelText('回复助手')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发送回复' })).not.toBeInTheDocument();
  });

  it('阻止仅空白的回复并显示内联校验错误', async () => {
    const sendMock = vi.fn();
    useRunConversationMock.mockReturnValue({ send: sendMock, isSending: false, error: null });
    getRunMock.mockResolvedValue({ summary: summary(RunStatus.WAITING_FOR_INPUT), prompt: '', output: '', resultJson: '', logsPath: '', artifactsDir: '', cleanupError: '', driver: '', imageRef: '', warnings: [], errorStack: '' });
    const user = userEvent.setup();
    renderScreen();

    await user.type(await screen.findByLabelText('回复助手'), '   ');
    await user.click(screen.getByRole('button', { name: '发送回复' }));

    expect(sendMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('请输入回复内容');
  });

  it('发送期间禁用控件，并在 mutation 失败时展示内联错误', async () => {
    useRunConversationMock.mockReturnValue({ send: vi.fn(), isSending: true, error: new Error('回复已过期') });
    getRunMock.mockResolvedValue({ summary: summary(RunStatus.WAITING_FOR_INPUT), prompt: '', output: '', resultJson: '', logsPath: '', artifactsDir: '', cleanupError: '', driver: '', imageRef: '', warnings: [], errorStack: '' });
    renderScreen();

    const replyField = await screen.findByLabelText('回复助手');
    expect(replyField).toBeDisabled();
    expect(screen.getByRole('button', { name: '发送中…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('发送回复失败：回复已过期');
  });
  it('重新运行一次：调 retryRun 并跳转到新 run 详情', async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: /重新运行一次/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /重新运行一次/ }));
    await waitFor(() => expect(retryRunMock).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, 'r1'));
    await waitFor(() => expect(getRunMock).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, 'r2'));
  });

  it('重新运行失败给提示', async () => {
    retryRunMock.mockReset().mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: /重新运行一次/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /重新运行一次/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('重新运行失败'));
  });

  it('日志流开启元数据（includeMetadata）', async () => {
    renderScreen();
    await waitFor(() => expect(useRunLogsMock).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' }, 'r1', { tailLines: 200, follow: true, includeMetadata: true },
    ));
  });

  it('日志行渲染 HH:MM:SS 时间戳前缀', async () => {
    useRunLogsMock.mockReturnValue({
      lines: [{ id: 0, text: 'hello', at: new Date(2026, 7, 27, 14, 5, 9) }],
      status: null, connected: true, error: null, reset: vi.fn(),
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText('14:05:09')).toBeInTheDocument());
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('复制日志把全部文本写入剪贴板并提示已复制', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // user-event 的 setup() 会把 navigator.clipboard 装成 getter-only 的 stub（configurable: true）。
    // 先 setup 再用 defineProperty 覆盖成我们的 mock（Object.assign 无法覆盖 getter-only 访问器）。
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: '复制日志' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '复制日志' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('第 1 行'));
    await waitFor(() => expect(screen.getByText('已复制')).toBeInTheDocument());
  });

  it('事件类型筛选只显示选中类型', async () => {
    listRunEventsMock.mockReset().mockResolvedValue({
      events: [
        { id: 'e1', runId: 'r1', seq: 1n, kind: RunEventKind.STATUS, text: '开始运行', agent: '', name: '', payloadJson: '', success: true, exitCode: 0, stopReason: '', createdAt: undefined },
        { id: 'e2', runId: 'r1', seq: 2n, kind: RunEventKind.AGENT_MESSAGE, text: '结果', agent: '', name: '', payloadJson: '', success: true, exitCode: 0, stopReason: '', createdAt: undefined },
      ],
      total: 2,
      historyAvailable: true,
    });
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText('开始运行')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('事件类型筛选'), '2');
    expect(screen.getByText('结果')).toBeInTheDocument();
    expect(screen.queryByText('开始运行')).not.toBeInTheDocument();
  });

  it('失败事件显示退出码与 stopReason', async () => {
    listRunEventsMock.mockReset().mockResolvedValue({
      events: [{ id: 'e1', runId: 'r1', seq: 1n, kind: RunEventKind.AGENT_ACTIVITY, text: '出错了', agent: '', name: '', payloadJson: '', success: false, exitCode: 1, stopReason: 'timeout', createdAt: undefined }],
      total: 1,
      historyAvailable: true,
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText(/退出码 1/)).toBeInTheDocument());
    expect(screen.getByText(/timeout/)).toBeInTheDocument();
  });

  it('有 payloadJson 的事件可展开载荷', async () => {
    listRunEventsMock.mockReset().mockResolvedValue({
      events: [{ id: 'e1', runId: 'r1', seq: 1n, kind: RunEventKind.STATUS, text: '', agent: '', name: '', payloadJson: '{"a":1}', success: true, exitCode: 0, stopReason: '', createdAt: undefined }],
      total: 1,
      historyAvailable: true,
    });
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText('载荷')).toBeInTheDocument());
    await user.click(screen.getByText('载荷'));
    expect(screen.getByText('{"a":1}')).toBeInTheDocument();
  });

  it('加载更多：total 大于已加载时点按钮追加分页', async () => {
    listRunEventsMock
      .mockReset()
      .mockResolvedValueOnce({
        events: [{ id: 'e1', runId: 'r1', seq: 1n, kind: RunEventKind.STATUS, text: '第一页', agent: '', name: '', payloadJson: '', success: true, exitCode: 0, stopReason: '', createdAt: undefined }],
        total: 3,
        historyAvailable: true,
      })
      .mockResolvedValueOnce({
        events: [{ id: 'e2', runId: 'r1', seq: 2n, kind: RunEventKind.STATUS, text: '第二页', agent: '', name: '', payloadJson: '', success: true, exitCode: 0, stopReason: '', createdAt: undefined }],
        total: 3,
        historyAvailable: true,
      });
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: '加载更多' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '加载更多' }));
    await waitFor(() => expect(screen.getByText('第二页')).toBeInTheDocument());
    expect(listRunEventsMock).toHaveBeenLastCalledWith({ baseUrl: '', authToken: '' }, 'r1', { limit: 20, offset: 1 });
  });
});
