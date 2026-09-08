import { beforeEach, describe, expect, it, vi } from 'vitest';

const listRunsMock = vi.fn();
const getRunMock = vi.fn();
const stopRunMock = vi.fn();
const listRunEventsMock = vi.fn();
const followRunLogsMock = vi.fn();
const startAgentRunMock = vi.fn();
const sendRunHumanMessageMock = vi.fn();
const getDashboardOverviewMock = vi.fn();
const watchDashboardOverviewMock = vi.fn();

// 复刻 projects.test.ts 的 mock 结构：createConnectTransport 保留 options，
// createClient 让 unary RPC 调用流经 transport 的 interceptor 链。
vi.mock('@connectrpc/connect-web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@connectrpc/connect-web')>();
  return { ...actual, createConnectTransport: vi.fn((options: unknown) => ({ ...(options as object) })) };
});
vi.mock('@connectrpc/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@connectrpc/connect')>();
  return {
    ...actual,
    createClient: vi.fn((_service: unknown, transport: { interceptors?: unknown[] }) => {
      type AnyInterceptor = (
        next: (req: unknown) => Promise<unknown>,
      ) => (req: unknown) => Promise<unknown>;
      const interceptors = (transport?.interceptors ?? []) as AnyInterceptor[];
      const withInterceptors = (call: () => Promise<unknown>) => {
        const req = { header: new Headers() };
        let handler: (r: unknown) => Promise<unknown> = () => Promise.resolve(call());
        for (const interceptor of interceptors) {
          handler = interceptor(handler);
        }
        return handler(req);
      };
      return {
        listRuns: (...a: unknown[]) => withInterceptors(() => listRunsMock(...a)),
        getRun: (...a: unknown[]) => withInterceptors(() => getRunMock(...a)),
        stopRun: (...a: unknown[]) => withInterceptors(() => stopRunMock(...a)),
        listRunEvents: (...a: unknown[]) => withInterceptors(() => listRunEventsMock(...a)),
        startAgentRun: (...a: unknown[]) => withInterceptors(() => startAgentRunMock(...a)),
        sendRunHumanMessage: (...a: unknown[]) => withInterceptors(() => sendRunHumanMessageMock(...a)),
        // server-streaming 方法在 connect-web v2 中同步返回 AsyncIterable（非 Promise），
        // 因此不能走 withInterceptors 的 Promise 包裹，需直接透传 mock 的迭代器。
        followRunLogs: (...a: unknown[]) => followRunLogsMock(...a),
        getDashboardOverview: (...a: unknown[]) => withInterceptors(() => getDashboardOverviewMock(...a)),
        watchDashboardOverview: (...a: unknown[]) => watchDashboardOverviewMock(...a),
      };
    }),
  };
});

import { RunStatus, RunSource } from './gen/agentcompose/v2/agentcompose_pb';
import {
  listRuns,
  getRun,
  stopRun,
  listRunEvents,
  followRunLogs,
  retryRun,
  sendRunHumanMessage,
  getDashboardOverview,
  watchDashboardOverview,
} from './runs';

const s = { baseUrl: '', authToken: '' };

/** 测试用的假服务端流：按序吐出 items。 */
async function* fakeStream<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

describe('runs API', () => {
  beforeEach(() => {
    listRunsMock.mockReset().mockResolvedValue({ runs: [], total: 0 });
    getRunMock.mockReset();
    stopRunMock.mockReset();
    listRunEventsMock.mockReset().mockResolvedValue({ events: [], total: 0 });
    followRunLogsMock.mockReset();
    startAgentRunMock.mockReset();
    sendRunHumanMessageMock.mockReset();
    getDashboardOverviewMock.mockReset();
    watchDashboardOverviewMock.mockReset();
  });

  it('listRuns 返回 res.runs 并透传 limit/offset', async () => {
    const summary = { runId: 'r1', projectId: 'p1', projectName: 'proj', agentName: 'a1',
      projectRevision: 0n, agentId: '', source: RunSource.MANUAL, schedulerId: '', triggerId: '',
      status: RunStatus.RUNNING, exitCode: 0, error: '', durationMs: 0n, warnings: [], sandboxId: '',
      runShortId: 'r1', sandboxShortId: '', schedulerRunId: '' };
    listRunsMock.mockResolvedValue({ runs: [summary], total: 1 });
    const runs = await listRuns(s, { limit: 10, offset: 20 });
    expect(runs).toEqual([summary]);
    expect(listRunsMock).toHaveBeenCalledWith({ limit: 10, offset: 20 });
  });

  it('getRun 返回 res.run，缺失时 undefined', async () => {
    getRunMock.mockResolvedValue({ run: { prompt: '', output: '' } });
    expect(await getRun(s, 'r1')).toEqual({ prompt: '', output: '' });
    getRunMock.mockResolvedValue({ run: undefined });
    expect(await getRun(s, 'r1')).toBeUndefined();
  });

  it('stopRun 带默认 reason 并返回 res.run', async () => {
    stopRunMock.mockResolvedValue({ run: { prompt: '' }, stopRequested: true });
    const run = await stopRun(s, 'r1');
    expect(run).toEqual({ prompt: '' });
    expect(stopRunMock).toHaveBeenCalledWith({ runId: 'r1', reason: 'user stopped from UI' });
  });

  it('listRunEvents 透传 limit/offset 并返回 { events, total, historyAvailable }', async () => {
    listRunEventsMock.mockResolvedValue({ events: [{ id: 'e1', runId: 'r1', seq: 1n }], total: 5, historyAvailable: true });
    const res = await listRunEvents(s, 'r1', { limit: 50, offset: 20 });
    expect(res).toEqual({ events: [{ id: 'e1', runId: 'r1', seq: 1n }], total: 5, historyAvailable: true });
    expect(listRunEventsMock).toHaveBeenCalledWith({ runId: 'r1', limit: 50, offset: 20 });
  });

  it('followRunLogs 组装请求（tailLines/tailSet/follow）并返回迭代器，signal 透传', async () => {
    followRunLogsMock.mockImplementation((_req: unknown, _opts?: { signal?: AbortSignal }) => {
      return fakeStream([{ data: 'hi\n', offset: 0n, isFinal: false, runStatus: RunStatus.RUNNING, prompt: '' }]);
    });
    const ac = new AbortController();
    const iter = followRunLogs(s, 'r1', { tailLines: 100, follow: true }, ac.signal);
    const first = await iter[Symbol.asyncIterator]().next();
    expect(first.value.data).toBe('hi\n');
    expect(followRunLogsMock).toHaveBeenCalledWith(
      { runId: 'r1', projectId: '', tailLines: 100, tailSet: true, startOffset: 0n, follow: true, includeMetadata: false },
      { signal: ac.signal },
    );
  });

  it('followRunLogs 未传 tailLines 时 tailSet=false（服务端默认尾部）', () => {
    followRunLogs(s, 'r1', {}, undefined);
    expect(followRunLogsMock).toHaveBeenCalledWith(
      { runId: 'r1', projectId: '', tailLines: 200, tailSet: false, startOffset: 0n, follow: true, includeMetadata: false },
      undefined,
    );
  });

  it('followRunLogs includeMetadata:true 时透传元数据开关', () => {
    followRunLogs(s, 'r1', { includeMetadata: true }, undefined);
    expect(followRunLogsMock).toHaveBeenCalledWith(
      { runId: 'r1', projectId: '', tailLines: 200, tailSet: false, startOffset: 0n, follow: true, includeMetadata: true },
      undefined,
    );
  });

  it('getDashboardOverview 返回 res.overview', async () => {
    getDashboardOverviewMock.mockResolvedValue({ overview: { runs: { runningCount: 1, recentCount: 2, attentionCount: 0 } } });
    expect(await getDashboardOverview(s)).toEqual({ runs: { runningCount: 1, recentCount: 2, attentionCount: 0 } });
  });

  it('watchDashboardOverview 返回迭代器并透传 signal', () => {
    watchDashboardOverviewMock.mockImplementation((_req: unknown, _opts?: { signal?: AbortSignal }) => {
      return fakeStream([{ overview: undefined, reason: '' }]);
    });
    const ac = new AbortController();
    const iter = watchDashboardOverview(s, ac.signal);
    expect(watchDashboardOverviewMock).toHaveBeenCalledWith({}, { signal: ac.signal });
    void iter;
  });

  it('retryRun 取 detail 后以 projectId/agentName/prompt 再 startAgentRun', async () => {
    getRunMock.mockResolvedValue({
      run: {
        summary: { runId: 'r1', projectId: 'p1', projectName: 'proj', agentName: 'a1', projectRevision: 0n, agentId: '', source: RunSource.MANUAL, schedulerId: '', triggerId: '', status: RunStatus.RUNNING, exitCode: 0, error: '', durationMs: 0n, warnings: [], sandboxId: '', runShortId: 'r1', sandboxShortId: '', schedulerRunId: '' },
        prompt: '原 prompt', output: '', resultJson: '', logsPath: '', artifactsDir: '', cleanupError: '', driver: '', imageRef: '', warnings: [], errorStack: '',
      },
    });
    startAgentRunMock.mockResolvedValue({
      run: { runId: 'r2', projectId: 'p1', projectName: 'proj', agentName: 'a1', projectRevision: 0n, agentId: '', source: RunSource.MANUAL, schedulerId: '', triggerId: '', status: RunStatus.RUNNING, exitCode: 0, error: '', durationMs: 0n, warnings: [], sandboxId: '', runShortId: 'r2', sandboxShortId: '', schedulerRunId: '' },
      warnings: [], started: true,
    });
    const run = await retryRun(s, 'r1');
    expect(run.runId).toBe('r2');
    expect(startAgentRunMock).toHaveBeenCalledWith({
      run: { projectId: 'p1', agentName: 'a1', prompt: '原 prompt', source: RunSource.MANUAL },
    });
  });

  it('retryRun 找不到 detail 抛人话错误', async () => {
    getRunMock.mockResolvedValue({ run: undefined });
    await expect(retryRun(s, 'r1')).rejects.toThrow('运行不存在');
  });

  it('sendRunHumanMessage 保留调用方提供的幂等消息 ID', async () => {
    sendRunHumanMessageMock.mockResolvedValue({ run: { runId: 'r1', status: RunStatus.RUNNING } });
    const run = await sendRunHumanMessage(s, 'r1', '日志在 /workspace/log.md', 'm1');
    expect(sendRunHumanMessageMock).toHaveBeenCalledWith({
      runId: 'r1', text: '日志在 /workspace/log.md', clientMessageId: 'm1',
    });
    expect(run.runId).toBe('r1');
  });
});
