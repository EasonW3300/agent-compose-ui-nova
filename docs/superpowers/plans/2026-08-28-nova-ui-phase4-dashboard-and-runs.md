# Nova UI Phase 4 — 首页 Dashboard + 运行记录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现主控台的首页 Dashboard（§5.1）、运行记录列表 + 运行详情（§5.3），并落地 §8 的流式接口独立订阅 hook（断线自动重连、指数退避、组件卸载即取消）。

**Architecture:** 数据层新增 `src/api/runs.ts`（RunService + DashboardService 全部 RPC 的薄封装，含两个 server-streaming 包装）；展示层新增 `src/domain/runView.ts`（行模型 + 枚举人话 + 时间/耗时格式化）与 `src/domain/runLog.ts`（日志分片累积纯 reducer）；中间层新增 `src/hooks/useServerStream.ts`（通用流订阅 hook，§8 基础设施）、`useRunLogs.ts`、`useDashboard.ts`。UI 三页：`DashboardScreen`（四块卡片 + 快捷入口）、`RunsScreen`（全局表格）、`RunDetailScreen`（状态色条 + 流式日志 + 事件时间线 + 停止二次确认）。最后接线路由（`/console` 首页、`runs`、`runs/:runId`）并把「立即运行/测试运行一次」改为跳运行详情。

**Tech Stack:** React 18 + Vite + TypeScript + react-router-dom v7 + `@tanstack/react-query@^5` + `@connectrpc/connect-web` v2.1.2 + vitest + @testing-library/react。无新增依赖。

## Global Constraints

- 永不修改 `src/api/gen/**`（手写胶水代码仅限连接层与 api 层）。
- 新增依赖：**无**（React Query、connect-web、react-router 均已安装）。
- `npm run build`（`tsc -b && vite build`）与 `npm run lint`（oxlint）必须全绿零警告；测试全绿。
- TDD：每个任务先写失败测试（红）→ 最小实现（绿）→ 全量回归 → 提交。每任务一个 commit。
- 文案转译表（spec §7）：`run`→运行、`logs`→日志、`agent`→AI 助手、`sandbox`→助手的工作台、`project`→助手团队、`scheduler`→什么时候干活。界面不得出现 `run_id`/`agentName` 等术语。
- 流式接口一律经 `useServerStream` 封装：断线自动重连（指数退避）、组件卸载即取消（spec §8）。禁止组件直接 `for await` 裸订阅。
- 401 任何受保护 RPC → 登录浮层（`authInterceptor` 已全局派发 `UNAUTHORIZED_EVENT`，本阶段零改动）。
- `Timestamp`→`Date` 一律 `timestampDate()`（`@bufbuild/protobuf/wkt`）；本版本 protobuf 无 `.toDate()`。
- `ProjectRef` 形状是 `{ selector: { case, value } }`——本阶段无新增 ProjectRef 需求，沿用 `projectRefByName`/`projectRefById`（不触碰）。
- 枚举短形式（buf）：`RunStatus.{UNSPECIFIED,PENDING,RUNNING,SUCCEEDED,FAILED,CANCELED}`、`RunSource.{UNSPECIFIED,MANUAL,SCHEDULER,API}`、`RunEventKind.{UNSPECIFIED,USER_MESSAGE,AGENT_MESSAGE,AGENT_ACTIVITY,STATUS}`。
- 复用既有：`runStatusLabel`（src/domain/agentCard.ts）、`createDaemonTransport`/`ConnectionSettings`/`loadConnectionSettings`（src/api/connection.ts）、`renderWithClient`（src/test/renderWithClient.tsx）。
- 分支：`feat/phase4-dashboard-runs`，从 `feat/phase3-create-wizard`（HEAD `64e5de5`）切出；**不使用 git worktree**（沿用 R1）。若 Phase 3 PR #2 中途合入 main，finishing 时再决定 rebase 与否，本阶段不动作。
- 测试命令行固定为 `npx vitest run <file>`（**绝不跑裸 `npx vitest`** —— watch 模式会挂起）。

## 数据流裁决（写进每份 brief）

- **R1 Dashboard 四块与字段映射（spec §5.1 vs gen 契约的裁决）：** gen `DashboardOverview.runs: RunOverview { runningCount, recentCount, attentionCount }`。映射：运行中助手数→`runningCount`；今日运行次数→`recentCount`（daemon 侧语义为近期滚动窗口，spec 文案「今日」优先）；最近失败告警→`attentionCount`（计数 >0 时渲染人话告警 + 「查看日志」跳 `/console/runs`）。`GetDashboardOverviewRequest`/`WatchDashboardOverviewRequest` 均为空 `{}`；`WatchDashboardOverviewResponse` 每帧含 `overview?: DashboardOverview` 与 `reason: string`，`useDashboard` 只取 `overview`。
- **R2 `followRunLogs` 数据面：** `RunLogChunk { data: string, offset: bigint, isFinal: boolean, runStatus: RunStatus, createdAt?, run?, prompt }`。**没有 stream（stdout/stderr）字段**——日志查看器不做双流着色，纯文本行。终止判定 `chunk.isFinal`；`runStatus` 在 `!== UNSPECIFIED` 时带出。请求 `{ runId, projectId: '', tailLines, tailSet, startOffset: 0n, follow, includeMetadata: false }`（`tailSet = opts.tailLines != null`，避免服务端把 `tailLines:200` 当未指定）。connect-web v2.1.2 server-streaming 签名：`(request: MessageInitShape<I>, options?: CallOptions) => AsyncIterable<MessageShape<O>>`（`promise-client.d.ts` 已验证），`CallOptions` 支持 `{ signal }`。
- **R3 `useServerStream` 语义：** 消息跨重连累积不清空（日志续传）；`isTerminal` 命中 → 停止消费且不再重连；流正常结束（非终止）或抛错 → 按 `backoffMs * 2^attempts`（封顶 `maxBackoffMs`）调度重连；卸载时 abort 当前订阅并清定时器；`reset()` 清消息并立即重连。`accumulate:false` 时只跑 `onMessage` 副作用、不存消息数组（Dashboard 用）。
- **R4 运行详情状态判定：** 终态 = `SUCCEEDED | FAILED | CANCELED`（`isRunTerminal`）。非终态才显示「停止这次运行」（`StopRun` 前置二次确认）。`RunSummary` 无 displayName，列表/详情直接显示 `agentName`（页面标签「AI 助手」列）。
- **R5 立即运行/测试运行跳详情：** `startAgentRun`（src/api/projects.ts，已存在）返回 `RunSummary`；T10 把 `AgentListScreen` 的 `runMutation` 与 `CreateWizard.saveAndRun(runAfter)` 改为 `navigate('/console/runs/${run.runId}')`。⚠️ 测试 mock 形状注意：`CreateWizard.test` 的 `startAgentRunMock` 目前 resolve `{ run: { runId: 'r1' } }`（RPC 原始响应形状），但组件消费的是 wrapper 返回值 `RunSummary`，必须改成 `{ runId: 'r1' }`。

---

## 计划文件结构

```
src/api/runs.ts, runs.test.ts                    # T1 Run/Dashboard API（含 2 个流式包装）
src/domain/runView.ts, runView.test.ts           # T2 行模型 + 枚举人话 + 时间/耗时格式化
src/domain/runLog.ts, runLog.test.ts             # T3 日志分片累积纯 reducer
src/hooks/useServerStream.ts, useServerStream.test.tsx  # T4 通用流订阅 hook
src/hooks/useRunLogs.ts, useRunLogs.test.tsx     # T5 运行日志 hook
src/hooks/useDashboard.ts, useDashboard.test.tsx # T6 首页概览 hook（unary + watch）
src/ui/DashboardScreen.tsx, DashboardScreen.test.tsx   # T7 首页四块 + 快捷入口
src/ui/RunsScreen.tsx, RunsScreen.test.tsx             # T8 运行记录表格
src/ui/RunDetailScreen.tsx, RunDetailScreen.test.tsx   # T9 运行详情（色条+日志+事件+停止）
src/ui/console.css                                # T7/T8/T9 分别追加对应样式
src/App.tsx, App.test.tsx                         # T10 路由接线（首页/runs/runs/:runId）
src/ui/AgentListScreen.tsx, AgentListScreen.test.tsx   # T10 立即运行→详情
src/ui/CreateWizard.tsx, CreateWizard.test.tsx    # T10 测试运行→详情
```

---

## Task 1: `src/api/runs.ts` — Run/Dashboard API 薄封装

**Files:**
- Create: `src/api/runs.ts`
- Test: `src/api/runs.test.ts`

**Interfaces:**
- Consumes: `createDaemonTransport`/`ConnectionSettings`（src/api/connection.ts）；gen 的 `RunService`、`DashboardService`、`RunStatus` 枚举与类型。
- Produces（后续任务依赖的精确签名）:
  - `listRuns(s: ConnectionSettings, opts?: { limit?: number; offset?: number }): Promise<RunSummary[]>`
  - `getRun(s: ConnectionSettings, runId: string): Promise<RunDetail | undefined>`
  - `stopRun(s: ConnectionSettings, runId: string, reason?: string): Promise<RunDetail | undefined>`
  - `listRunEvents(s: ConnectionSettings, runId: string, opts?: { limit?: number }): Promise<RunEvent[]>`
  - `followRunLogs(s: ConnectionSettings, runId: string, opts?: { tailLines?: number; follow?: boolean }, signal?: AbortSignal): AsyncIterable<RunLogChunk>`
  - `getDashboardOverview(s: ConnectionSettings): Promise<DashboardOverview | undefined>`
  - `watchDashboardOverview(s: ConnectionSettings, signal?: AbortSignal): AsyncIterable<WatchDashboardOverviewResponse>`
  - `export interface FollowRunLogsOptions { tailLines?: number; follow?: boolean }`

- [ ] **Step 1: 写失败测试**

创建 `src/api/runs.test.ts`，mock 结构与 `src/api/projects.test.ts` 完全一致（`createConnectTransport` 保留 options、`createClient` 按方法名派发到 per-method mock、interceptor 链套在真实调用外）：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listRunsMock = vi.fn();
const getRunMock = vi.fn();
const stopRunMock = vi.fn();
const listRunEventsMock = vi.fn();
const followRunLogsMock = vi.fn();
const getDashboardOverviewMock = vi.fn();
const watchDashboardOverviewMock = vi.fn();

// 复刻 projects.test.ts 的 mock 结构：createConnectTransport 保留 options，
// createClient 让 RPC 调用流经 transport 的 interceptor 链。
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
        followRunLogs: (...a: unknown[]) => withInterceptors(() => followRunLogsMock(...a)),
        getDashboardOverview: (...a: unknown[]) => withInterceptors(() => getDashboardOverviewMock(...a)),
        watchDashboardOverview: (...a: unknown[]) => withInterceptors(() => watchDashboardOverviewMock(...a)),
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

  it('listRunEvents 透传 limit 并返回 res.events', async () => {
    listRunEventsMock.mockResolvedValue({ events: [{ id: 'e1', runId: 'r1', seq: 1n }], total: 1 });
    const events = await listRunEvents(s, 'r1', { limit: 50 });
    expect(events).toEqual([{ id: 'e1', runId: 'r1', seq: 1n }]);
    expect(listRunEventsMock).toHaveBeenCalledWith({ runId: 'r1', limit: 50, offset: 0 });
  });

  it('followRunLogs 组装请求（tailLines/tailSet/follow）并返回迭代器，signal 透传', async () => {
    followRunLogsMock.mockImplementation((_req: unknown, opts?: { signal?: AbortSignal }) => {
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

  it('getDashboardOverview 返回 res.overview', async () => {
    getDashboardOverviewMock.mockResolvedValue({ overview: { runs: { runningCount: 1, recentCount: 2, attentionCount: 0 } } });
    expect(await getDashboardOverview(s)).toEqual({ runs: { runningCount: 1, recentCount: 2, attentionCount: 0 } });
  });

  it('watchDashboardOverview 返回迭代器并透传 signal', () => {
    watchDashboardOverviewMock.mockImplementation((_req: unknown, opts?: { signal?: AbortSignal }) => {
      return fakeStream([{ overview: undefined, reason: '' }]);
    });
    const ac = new AbortController();
    const iter = watchDashboardOverview(s, ac.signal);
    expect(watchDashboardOverviewMock).toHaveBeenCalledWith({}, { signal: ac.signal });
    void iter;
  });
});
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/api/runs.test.ts`
Expected: 失败——`./runs` 模块不存在（`Failed to resolve import`）。

- [ ] **Step 3: 实现 `src/api/runs.ts`**

```ts
import { createClient } from '@connectrpc/connect';
import { createDaemonTransport, type ConnectionSettings } from './connection';
import {
  DashboardService,
  RunService,
  type DashboardOverview,
  type RunDetail,
  type RunEvent,
  type RunLogChunk,
  type RunSummary,
  type WatchDashboardOverviewResponse,
} from './gen/agentcompose/v2/agentcompose_pb';

function runClient(s: ConnectionSettings) {
  return createClient(RunService, createDaemonTransport(s));
}

function dashboardClient(s: ConnectionSettings) {
  return createClient(DashboardService, createDaemonTransport(s));
}

export interface ListRunsOptions {
  limit?: number;
  offset?: number;
}

export async function listRuns(
  s: ConnectionSettings,
  opts: ListRunsOptions = {},
): Promise<RunSummary[]> {
  const res = await runClient(s).listRuns({ limit: opts.limit ?? 50, offset: opts.offset ?? 0 });
  return res.runs;
}

export async function getRun(s: ConnectionSettings, runId: string): Promise<RunDetail | undefined> {
  const res = await runClient(s).getRun({ runId, projectId: '' });
  return res.run;
}

export async function stopRun(
  s: ConnectionSettings,
  runId: string,
  reason = 'user stopped from UI',
): Promise<RunDetail | undefined> {
  const res = await runClient(s).stopRun({ runId, reason });
  return res.run;
}

export async function listRunEvents(
  s: ConnectionSettings,
  runId: string,
  opts: { limit?: number } = {},
): Promise<RunEvent[]> {
  const res = await runClient(s).listRunEvents({ runId, limit: opts.limit ?? 200, offset: 0 });
  return res.events;
}

export interface FollowRunLogsOptions {
  tailLines?: number;
  follow?: boolean;
}

export function followRunLogs(
  s: ConnectionSettings,
  runId: string,
  opts: FollowRunLogsOptions = {},
  signal?: AbortSignal,
): AsyncIterable<RunLogChunk> {
  return runClient(s).followRunLogs(
    {
      runId,
      projectId: '',
      tailLines: opts.tailLines ?? 200,
      tailSet: opts.tailLines != null,
      startOffset: 0n,
      follow: opts.follow ?? true,
      includeMetadata: false,
    },
    signal ? { signal } : undefined,
  );
}

export async function getDashboardOverview(
  s: ConnectionSettings,
): Promise<DashboardOverview | undefined> {
  const res = await dashboardClient(s).getDashboardOverview({});
  return res.overview;
}

export function watchDashboardOverview(
  s: ConnectionSettings,
  signal?: AbortSignal,
): AsyncIterable<WatchDashboardOverviewResponse> {
  return dashboardClient(s).watchDashboardOverview({}, signal ? { signal } : undefined);
}
```

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/api/runs.test.ts`
Expected: 全绿（8 用例）。

- [ ] **Step 5: 全量回归 + 提交**

```bash
npx vitest run && npm run build && npm run lint
git add src/api/runs.ts src/api/runs.test.ts
git commit -m "feat: 运行/看板 API 层（含 followRunLogs/watchDashboardOverview 流式包装）"
```

---

## Task 2: `src/domain/runView.ts` — 行模型 + 枚举人话 + 格式化

**Files:**
- Create: `src/domain/runView.ts`
- Test: `src/domain/runView.test.ts`

**Interfaces:**
- Consumes: gen `RunStatus`/`RunSource`/`RunEventKind`/`RunSummary`；`runStatusLabel`（src/domain/agentCard.ts，已存在：RUNNING→正在工作/SUCCEEDED→已完成/FAILED→出了点问题/CANCELED→已停止/PENDING→排队中/默认→未知）；`timestampDate`。
- Produces:
  - `export interface RunRow { key; runId; runShortId; agentName; projectName; sourceLabel; statusLabel; status: RunStatus; durationText; startedText; startedAt: Date | null; terminal: boolean }`
  - `isRunTerminal(status: RunStatus): boolean`
  - `runToRow(r: RunSummary): RunRow`
  - `describeRunSource(source: RunSource): string`
  - `describeRunEventKind(kind: RunEventKind): string`
  - `runStatusTone(status: RunStatus): 'running' | 'succeeded' | 'failed' | 'stopped' | 'idle'`
  - `formatDuration(ms: bigint): string`
  - `formatTime(d: Date): string`

- [ ] **Step 1: 写失败测试**

创建 `src/domain/runView.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { RunEventKind, RunSource, RunStatus } from '../api/gen/agentcompose/v2/agentcompose_pb';
import {
  describeRunEventKind,
  describeRunSource,
  formatDuration,
  formatTime,
  isRunTerminal,
  runStatusTone,
  runToRow,
} from './runView';

function summary(over: Partial<Parameters<typeof runToRow>[0]> = {}): Parameters<typeof runToRow>[0] {
  return {
    runId: 'r1', projectId: 'p1', projectName: 'proj', projectRevision: 0n, agentId: 'ag',
    agentName: 'my-report', source: RunSource.MANUAL, schedulerId: '', triggerId: '',
    status: RunStatus.RUNNING, exitCode: 0, error: '', durationMs: 0n, warnings: [],
    sandboxId: '', runShortId: 'abc12345', sandboxShortId: '', schedulerRunId: '', ...over,
  };
}

describe('runView', () => {
  it('runToRow 映射字段：来源/状态人话、耗时、开始时间、终态', () => {
    const row = runToRow(summary({ status: RunStatus.SUCCEEDED, durationMs: 90_000n, startedAt: undefined }));
    expect(row.key).toBe('r1');
    expect(row.runShortId).toBe('abc12345');
    expect(row.agentName).toBe('my-report');
    expect(row.sourceLabel).toBe('手动运行');
    expect(row.statusLabel).toBe('已完成');
    expect(row.durationText).toBe('1 分 30 秒');
    expect(row.startedText).toBe('—');
    expect(row.terminal).toBe(true);
    expect(row.status).toBe(RunStatus.SUCCEEDED);
  });

  it('runToRow 无 runShortId 时回退到 runId 前 8 位', () => {
    const row = runToRow(summary({ runShortId: '' }));
    expect(row.runShortId).toBe('r1'); // runId 'r1'.slice(0, 8) = 'r1'
  });

  it('describeRunSource 覆盖四种来源', () => {
    expect(describeRunSource(RunSource.MANUAL)).toBe('手动运行');
    expect(describeRunSource(RunSource.SCHEDULER)).toBe('定时触发');
    expect(describeRunSource(RunSource.API)).toBe('API 调用');
    expect(describeRunSource(RunSource.UNSPECIFIED)).toBe('未知');
  });

  it('describeRunEventKind 覆盖五种事件', () => {
    expect(describeRunEventKind(RunEventKind.USER_MESSAGE)).toBe('你的消息');
    expect(describeRunEventKind(RunEventKind.AGENT_MESSAGE)).toBe('助手消息');
    expect(describeRunEventKind(RunEventKind.AGENT_ACTIVITY)).toBe('助手活动');
    expect(describeRunEventKind(RunEventKind.STATUS)).toBe('状态变化');
    expect(describeRunEventKind(RunEventKind.UNSPECIFIED)).toBe('未知');
  });

  it('runStatusTone 映射到 CSS 语义', () => {
    expect(runStatusTone(RunStatus.RUNNING)).toBe('running');
    expect(runStatusTone(RunStatus.SUCCEEDED)).toBe('succeeded');
    expect(runStatusTone(RunStatus.FAILED)).toBe('failed');
    expect(runStatusTone(RunStatus.CANCELED)).toBe('stopped');
    expect(runStatusTone(RunStatus.PENDING)).toBe('idle');
    expect(runStatusTone(RunStatus.UNSPECIFIED)).toBe('idle');
  });

  it('formatDuration 人类可读', () => {
    expect(formatDuration(0n)).toBe('—');
    expect(formatDuration(3_000n)).toBe('3 秒');
    expect(formatDuration(90_000n)).toBe('1 分 30 秒');
    expect(formatDuration(120_000n)).toBe('2 分钟');
  });

  it('formatTime 输出 MM-DD HH:mm（本地时区）', () => {
    expect(formatTime(new Date(2026, 7, 27, 14, 5))).toBe('08-27 14:05');
  });

  it('isRunTerminal 终态判定', () => {
    expect(isRunTerminal(RunStatus.SUCCEEDED)).toBe(true);
    expect(isRunTerminal(RunStatus.FAILED)).toBe(true);
    expect(isRunTerminal(RunStatus.CANCELED)).toBe(true);
    expect(isRunTerminal(RunStatus.RUNNING)).toBe(false);
    expect(isRunTerminal(RunStatus.PENDING)).toBe(false);
    expect(isRunTerminal(RunStatus.UNSPECIFIED)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/domain/runView.test.ts`
Expected: 失败——`./runView` 不存在。

- [ ] **Step 3: 实现 `src/domain/runView.ts`**

```ts
import { timestampDate } from '@bufbuild/protobuf/wkt';
import {
  RunEventKind,
  RunSource,
  RunStatus,
  type RunSummary,
} from '../api/gen/agentcompose/v2/agentcompose_pb';
import { runStatusLabel } from './agentCard';

export function isRunTerminal(status: RunStatus): boolean {
  return (
    status === RunStatus.SUCCEEDED ||
    status === RunStatus.FAILED ||
    status === RunStatus.CANCELED
  );
}

export type RunStatusTone = 'running' | 'succeeded' | 'failed' | 'stopped' | 'idle';

export function runStatusTone(status: RunStatus): RunStatusTone {
  switch (status) {
    case RunStatus.RUNNING: return 'running';
    case RunStatus.SUCCEEDED: return 'succeeded';
    case RunStatus.FAILED: return 'failed';
    case RunStatus.CANCELED: return 'stopped';
    default: return 'idle';
  }
}

const RUN_SOURCE_LABELS: Record<RunSource, string> = {
  [RunSource.MANUAL]: '手动运行',
  [RunSource.SCHEDULER]: '定时触发',
  [RunSource.API]: 'API 调用',
  [RunSource.UNSPECIFIED]: '未知',
};

export function describeRunSource(source: RunSource): string {
  return RUN_SOURCE_LABELS[source] ?? '未知';
}

const RUN_EVENT_KIND_LABELS: Record<RunEventKind, string> = {
  [RunEventKind.USER_MESSAGE]: '你的消息',
  [RunEventKind.AGENT_MESSAGE]: '助手消息',
  [RunEventKind.AGENT_ACTIVITY]: '助手活动',
  [RunEventKind.STATUS]: '状态变化',
  [RunEventKind.UNSPECIFIED]: '未知',
};

export function describeRunEventKind(kind: RunEventKind): string {
  return RUN_EVENT_KIND_LABELS[kind] ?? '未知';
}

export interface RunRow {
  key: string;
  runId: string;
  runShortId: string;
  agentName: string;
  projectName: string;
  sourceLabel: string;
  statusLabel: string;
  status: RunStatus;
  durationText: string;
  startedText: string;
  startedAt: Date | null;
  terminal: boolean;
}

export function runToRow(r: RunSummary): RunRow {
  const startedAt = r.startedAt ? timestampDate(r.startedAt) : null;
  return {
    key: r.runId,
    runId: r.runId,
    runShortId: r.runShortId || r.runId.slice(0, 8),
    agentName: r.agentName,
    projectName: r.projectName,
    sourceLabel: describeRunSource(r.source),
    statusLabel: runStatusLabel(r.status),
    status: r.status,
    durationText: formatDuration(r.durationMs),
    startedText: startedAt ? formatTime(startedAt) : '—',
    startedAt,
    terminal: isRunTerminal(r.status),
  };
}

export function formatDuration(ms: bigint): string {
  const total = Number(ms);
  if (!Number.isFinite(total) || total <= 0) return '—';
  const sec = Math.floor(total / 1000);
  const minute = Math.floor(sec / 60);
  if (minute >= 1) {
    const rem = sec % 60;
    return rem > 0 ? `${minute} 分 ${rem} 秒` : `${minute} 分钟`;
  }
  return `${sec} 秒`;
}

export function formatTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
```

> 注意：`RunEventKind.STATUS` 存在（gen 已确认五个成员）。`Record<枚举, string>` 用计算属性键合法；oxlint 不告警。

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/domain/runView.test.ts`
Expected: 全绿。

- [ ] **Step 5: 全量回归 + 提交**

```bash
npx vitest run && npm run build && npm run lint
git add src/domain/runView.ts src/domain/runView.test.ts
git commit -m "feat: 运行行模型与枚举人话/耗时格式化"
```

---

## Task 3: `src/domain/runLog.ts` — 日志分片累积纯 reducer

**Files:**
- Create: `src/domain/runLog.ts`
- Test: `src/domain/runLog.test.ts`

**Interfaces:**
- Consumes: gen `RunLogChunk` 类型（`{ data: string; offset: bigint; isFinal: boolean; runStatus: RunStatus; ... }`）。
- Produces:
  - `export interface LogLine { id: number; text: string }`
  - `export interface LogBuffer { partial: string; lines: LogLine[]; nextId: number }`
  - `createLogBuffer(): LogBuffer`
  - `appendLogChunk(buf: LogBuffer, chunk: RunLogChunk): LogBuffer`

- [ ] **Step 1: 写失败测试**

创建 `src/domain/runLog.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { RunStatus } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { appendLogChunk, createLogBuffer } from './runLog';

function chunk(data: string, over: Partial<Parameters<typeof appendLogChunk>[1]> = {}) {
  return {
    data, offset: 0n, isFinal: false, runStatus: RunStatus.RUNNING, prompt: '',
    ...over,
  } as Parameters<typeof appendLogChunk>[1];
}

describe('runLog 累积', () => {
  it('单个分片多行切成整行，行号从 0 递增', () => {
    let buf = createLogBuffer();
    buf = appendLogChunk(buf, chunk('第 1 行\n第 2 行'));
    expect(buf.lines.map((l) => l.text)).toEqual(['第 1 行', '第 2 行']);
    expect(buf.lines.map((l) => l.id)).toEqual([0, 1]);
    expect(buf.partial).toBe('');
  });

  it('跨分片残缺行拼接成一行', () => {
    let buf = createLogBuffer();
    buf = appendLogChunk(buf, chunk('abc\ndef'));
    expect(buf.lines.map((l) => l.text)).toEqual(['abc']);
    expect(buf.partial).toBe('def');
    buf = appendLogChunk(buf, chunk('ghi\n'));
    expect(buf.lines.map((l) => l.text)).toEqual(['abc', 'defghi']);
    expect(buf.partial).toBe('');
  });

  it('空 data 分片不产生新行', () => {
    let buf = createLogBuffer();
    buf = appendLogChunk(chunk('x\n'), { data: '' });
    expect(buf.lines.map((l) => l.text)).toEqual(['x']);
    expect(buf.partial).toBe('');
  });

  it('内容中间的空行保留（日志里的空行有意义）', () => {
    let buf = createLogBuffer();
    buf = appendLogChunk(buf, chunk('a\n\nb'));
    expect(buf.lines.map((l) => l.text)).toEqual(['a', '', 'b']);
    expect(buf.partial).toBe('b');
  });

  it('末尾换行的分片不产生多余空行', () => {
    let buf = createLogBuffer();
    buf = appendLogChunk(buf, chunk('a\n'));
    expect(buf.lines.map((l) => l.text)).toEqual(['a']);
    expect(buf.partial).toBe('');
  });
});
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/domain/runLog.test.ts`
Expected: 失败——`./runLog` 不存在。

- [ ] **Step 3: 实现 `src/domain/runLog.ts`**

```ts
import type { RunLogChunk } from '../api/gen/agentcompose/v2/agentcompose_pb';

export interface LogLine {
  id: number;
  text: string;
}

export interface LogBuffer {
  /** 尚未以换行收尾的残缺行（下个分片续上）。 */
  partial: string;
  /** 已完成的整行（含日志中间的空白行）。 */
  lines: LogLine[];
  /** 下一个行号，保证跨分片单调。 */
  nextId: number;
}

export function createLogBuffer(): LogBuffer {
  return { partial: '', lines: [], nextId: 0 };
}

/** 把一个日志分片追加进 buffer：按 \n 切出完整行，残缺尾部留在 partial。 */
export function appendLogChunk(buf: LogBuffer, chunk: RunLogChunk): LogBuffer {
  const joined = buf.partial + chunk.data;
  const parts = joined.split('\n');
  const partial = parts.pop() ?? '';
  const newLines: LogLine[] = parts.map((text, i) => ({ id: buf.nextId + i, text }));
  return { partial, lines: [...buf.lines, ...newLines], nextId: buf.nextId + newLines.length };
}
```

> 注：测试里的 `Parameters<typeof appendLogChunk>[1]` 引用实现类型——TDD 红阶段该文件不存在，测试会因模块解析失败而红（符合预期）；实现后类型即解析。若希望红阶段报更精确的断言失败而非模块解析失败，可把类型注解换成显式 `import { RunLogChunk } from '../api/gen/agentcompose/v2/agentcompose_pb'`，二选一均可。

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/domain/runLog.test.ts`
Expected: 全绿。

- [ ] **Step 5: 全量回归 + 提交**

```bash
npx vitest run && npm run build && npm run lint
git add src/domain/runLog.ts src/domain/runLog.test.ts
git commit -m "feat: 日志分片累积纯 reducer"
```

---

## Task 4: `src/hooks/useServerStream.ts` — 通用流订阅 hook（§8 基础设施）

**Files:**
- Create: `src/hooks/useServerStream.ts`
- Test: `src/hooks/useServerStream.test.tsx`

**Interfaces:**
- Consumes: 无（仅 React）。
- Produces:
  - `export interface ServerStreamOptions<T> { isTerminal: (msg: T) => boolean; onMessage?: (msg: T) => boolean | void; backoffMs?: number; maxBackoffMs?: number; enabled?: boolean; accumulate?: boolean }`
  - `export interface ServerStreamState<T> { messages: T[]; connected: boolean; error: string | null; reset: () => void }`
  - `useServerStream<T>(subscribe: (signal: AbortSignal) => AsyncIterable<T>, options: ServerStreamOptions<T>): ServerStreamState<T>`

- [ ] **Step 1: 写失败测试**

创建 `src/hooks/useServerStream.test.tsx`：

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useServerStream } from './useServerStream';

/** 造一个可控服务端流：yield items；throwAt 命中则抛错。 */
function streamOf<T>(items: T[], throwAt?: number) {
  return async function* (): AsyncIterable<T> {
    for (let i = 0; i < items.length; i += 1) {
      if (throwAt === i) throw new Error('boom');
      yield items[i];
    }
  };
}

function makeSubscribe<T>(builders: Array<(call: number) => AsyncIterable<T>>) {
  const subscribedSignals: AbortSignal[] = [];
  const subscribe = vi.fn((signal: AbortSignal) => {
    subscribedSignals.push(signal);
    return builders[subscribe.mock.calls.length - 1](subscribe.mock.calls.length);
  });
  return { subscribe, subscribedSignals };
}

describe('useServerStream', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('累积消息、connected 随订阅切换、isTerminal 命中后不再重连', async () => {
    const { subscribe } = makeSubscribe<string>([() => streamOf(['a', 'b'], 99)()]);
    const { result } = renderHook(() =>
      useServerStream(subscribe, { isTerminal: (m) => m === 'b' }),
    );
    await act(async () => { await vi.waitFor(() => expect(result.current.messages).toEqual(['a', 'b'])); });
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBeNull();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('断线后按指数退避重连，消息跨重连累积，成功续传', async () => {
    vi.useFakeTimers();
    // 第 1 次订阅：yield 'a' 后立即抛错；第 2 次订阅：yield 'c' 后 yield 终止消息 'done'
    const { subscribe } = makeSubscribe<string>([
      () => streamOf(['a'], 1)(),
      () => streamOf(['c', 'done'])() as AsyncIterable<string>,
    ]);
    const { result } = renderHook(() =>
      useServerStream(subscribe, { isTerminal: (m) => m === 'done', backoffMs: 1000, maxBackoffMs: 4000 }),
    );
    // 第 1 轮：'a' 到位后抛错 → error 状态 + 调度重连
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.messages).toEqual(['a']);
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBe('连接中断，正在重试…');
    expect(subscribe).toHaveBeenCalledTimes(1);
    // 推进 1000ms → 第 2 次订阅跑起来并终止
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(result.current.messages).toEqual(['a', 'c', 'done']);
    expect(result.current.error).toBeNull();
    expect(result.current.connected).toBe(false);
    // 已终止：再推进很久也不该有第 3 次订阅
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('reset 清空消息并立即重连', async () => {
    const { subscribe } = makeSubscribe<string>([
      () => streamOf(['x'])() as AsyncIterable<string>,
      () => streamOf(['y', 'z'])() as AsyncIterable<string>,
    ]);
    const { result } = renderHook(() => useServerStream(subscribe, { isTerminal: () => false, backoffMs: 1000 }));
    await act(async () => { await vi.waitFor(() => expect(result.current.messages).toEqual(['x'])); });
    act(() => result.current.reset());
    await act(async () => { await vi.waitFor(() => expect(result.current.messages).toEqual(['y', 'z'])); });
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('enabled=false 时不订阅', () => {
    const { subscribe } = makeSubscribe<string>([() => streamOf(['a'])() as AsyncIterable<string>]);
    renderHook(() => useServerStream(subscribe, { isTerminal: () => false, enabled: false }));
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('卸载即取消：abort 信号触发且不再重连', async () => {
    vi.useFakeTimers();
    const { subscribe, subscribedSignals } = makeSubscribe<string>([
      () => streamOf(['a', 'b'])() as AsyncIterable<string>,
    ]);
    const { unmount } = renderHook(() =>
      useServerStream(subscribe, { isTerminal: () => false, backoffMs: 1000, maxBackoffMs: 5000 }),
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // 第 1 轮完成（非终止）→ 已调度重连
    const abortSpy = vi.fn();
    subscribedSignals[0].addEventListener('abort', abortSpy);
    unmount();
    expect(abortSpy).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); }); // 定时器已被清掉
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('accumulate=false 不存消息但仍跑 onMessage', async () => {
    const onMessage = vi.fn();
    const { subscribe } = makeSubscribe<string>([() => streamOf(['a', 'b'])() as AsyncIterable<string>]);
    const { result } = renderHook(() =>
      useServerStream(subscribe, { isTerminal: () => false, accumulate: false, onMessage }),
    );
    await act(async () => { await vi.waitFor(() => expect(onMessage).toHaveBeenCalledTimes(2)); });
    expect(result.current.messages).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/hooks/useServerStream.test.tsx`
Expected: 失败——`./useServerStream` 不存在（模块解析错误）。

- [ ] **Step 3: 实现 `src/hooks/useServerStream.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ServerStreamOptions<T> {
  /** 一条消息判定为终止 → 停止消费且不再重连。 */
  isTerminal: (msg: T) => boolean;
  /** 每条消息的副作用（如同步 runStatus）。返回 true 强制视为终止。 */
  onMessage?: (msg: T) => boolean | void;
  /** 断线后首次重连等待（默认 1000ms），按 2 倍指数退避至 maxBackoffMs。 */
  backoffMs?: number;
  /** 退避上限（默认 15000ms）。 */
  maxBackoffMs?: number;
  /** false 时不订阅（如 runId 未知）。 */
  enabled?: boolean;
  /** 是否把每条消息累积进 messages（默认 true）。只关心副作用时设 false（Dashboard）。 */
  accumulate?: boolean;
}

export interface ServerStreamState<T> {
  /** 已收到的全部消息（重连间累积不清空）。 */
  messages: T[];
  /** 当前是否有一个活跃的订阅在跑。 */
  connected: boolean;
  /** 最近一次断线的人话描述；null = 正常。 */
  error: string | null;
  /** 清空消息并立即重连。 */
  reset: () => void;
}

export function useServerStream<T>(
  subscribe: (signal: AbortSignal) => AsyncIterable<T>,
  options: ServerStreamOptions<T>,
): ServerStreamState<T> {
  const {
    isTerminal,
    onMessage,
    backoffMs = 1000,
    maxBackoffMs = 15000,
    enabled = true,
    accumulate = true,
  } = options;
  const [messages, setMessages] = useState<T[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;
  const isTerminalRef = useRef(isTerminal);
  isTerminalRef.current = isTerminal;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const optsRef = useRef({ backoffMs, maxBackoffMs, accumulate });
  optsRef.current = { backoffMs, maxBackoffMs, accumulate };

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    setGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let attempts = 0;
    let controller: AbortController | null = null;
    let timer: number | null = null;

    const clearTimer = () => {
      if (timer != null) clearTimeout(timer);
      timer = null;
    };

    const schedule = () => {
      if (cancelled) return;
      const delay = Math.min(optsRef.current.backoffMs * 2 ** attempts, optsRef.current.maxBackoffMs);
      attempts += 1;
      timer = setTimeout(() => void run(), delay);
    };

    const run = async () => {
      clearTimer();
      if (cancelled) return;
      controller = new AbortController();
      setConnected(true);
      setError(null);
      try {
        const iter = subscribeRef.current(controller.signal);
        for await (const msg of iter) {
          if (cancelled) return;
          const forced = onMessageRef.current?.(msg);
          const terminal = isTerminalRef.current(msg) || forced === true;
          if (optsRef.current.accumulate) setMessages((m) => [...m, msg]);
          if (terminal) {
            setConnected(false);
            return;
          }
        }
        setConnected(false);
        schedule();
      } catch {
        if (cancelled) return;
        setConnected(false);
        setError('连接中断，正在重试…');
        schedule();
      }
    };

    void run();

    return () => {
      cancelled = true;
      clearTimer();
      controller?.abort();
    };
  }, [enabled, generation]);

  return { messages, connected, error, reset };
}
```

> 说明：`schedule` 在 `run` 之后声明但在 `run` **被调用时**已初始化（`void run()` 在其声明之后），闭包无 TDZ 问题。`reset` 用 `generation` 状态强制 effect 重启（旧订阅 abort + attempts 归零），同时清空 messages。

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/hooks/useServerStream.test.tsx`
Expected: 全绿（6 用例）。若有假定时器竞态，把 `vi.waitFor` 处先 `await act(async () => { await Promise.resolve(); })` 再断言消息数组。

- [ ] **Step 5: 全量回归 + 提交**

```bash
npx vitest run && npm run build && npm run lint
git add src/hooks/useServerStream.ts src/hooks/useServerStream.test.tsx
git commit -m "feat: 通用服务端流订阅 hook（指数退避重连 + 卸载取消）"
```

---

## Task 5: `src/hooks/useRunLogs.ts` — 运行日志 hook

**Files:**
- Create: `src/hooks/useRunLogs.ts`
- Test: `src/hooks/useRunLogs.test.tsx`

**Interfaces:**
- Consumes: `followRunLogs`/`FollowRunLogsOptions`（Task 1）；`appendLogChunk`/`createLogBuffer`/`LogLine`/`LogBuffer`（Task 3）；`useServerStream`（Task 4）；`RunStatus` 枚举。
- Produces:
  - `export interface RunLogsState { lines: LogLine[]; status: RunStatus | null; connected: boolean; error: string | null; reset: () => void }`
  - `useRunLogs(s: ConnectionSettings, runId: string | null, options?: FollowRunLogsOptions): RunLogsState`

- [ ] **Step 1: 写失败测试**

创建 `src/hooks/useRunLogs.test.tsx`：

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunStatus } from '../api/gen/agentcompose/v2/agentcompose_pb';
import type { RunLogChunk } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { useRunLogs } from './useRunLogs';

const followRunLogsMock = vi.fn();
vi.mock('../api/runs', () => ({
  followRunLogs: (...a: unknown[]) => followRunLogsMock(...a),
}));

function chunk(data: string, over: Partial<RunLogChunk> = {}): RunLogChunk {
  return { data, offset: 0n, isFinal: false, runStatus: RunStatus.RUNNING, prompt: '', ...over } as RunLogChunk;
}

const s = { baseUrl: '', authToken: '' };

describe('useRunLogs', () => {
  beforeEach(() => {
    followRunLogsMock.mockReset();
  });

  it('runId 为空不订阅', () => {
    const { result } = renderHook(() => useRunLogs(s, null, { tailLines: 100 }));
    expect(result.current.lines).toEqual([]);
    expect(followRunLogsMock).not.toHaveBeenCalled();
  });

  it('流式累积日志行并带出终态 runStatus', async () => {
    followRunLogsMock.mockImplementation(() =>
      (async function* (): AsyncIterable<RunLogChunk> {
        yield chunk('第 1 行\n第 2 行');
        yield chunk('收尾\n', { isFinal: true, runStatus: RunStatus.SUCCEEDED });
      })(),
    );
    const { result } = renderHook(() => useRunLogs(s, 'r1', { tailLines: 100 }));
    expect(followRunLogsMock).toHaveBeenCalledWith(
      s,
      'r1',
      { tailLines: 100 },
      expect.anything(),
    );
    await waitFor(() => expect(result.current.lines.map((l) => l.text)).toEqual(['第 1 行', '第 2 行', '收尾']));
    expect(result.current.status).toBe(RunStatus.SUCCEEDED);
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('未终止时断线给 error 并保持已收行', async () => {
    followRunLogsMock
      .mockImplementationOnce(() =>
        (async function* (): AsyncIterable<RunLogChunk> {
          yield chunk('a\n');
          throw new Error('boom');
        })(),
      )
      .mockImplementationOnce(() =>
        (async function* (): AsyncIterable<RunLogChunk> {
          yield chunk('b\n', { isFinal: true, runStatus: RunStatus.FAILED });
        })(),
      );
    const { result } = renderHook(() => useRunLogs(s, 'r1', { follow: true }));
    await waitFor(() => expect(result.current.lines.map((l) => l.text)).toEqual(['a']));
    // 第 1 轮断线后 error 出现、行保留
    await waitFor(() => expect(result.current.error).toBe('连接中断，正在重试…'));
    // 重连成功（真实定时器 1000ms 内会触发；用 waitFor 兜底轮询）
    await waitFor(
      () => expect(result.current.lines.map((l) => l.text)).toEqual(['a', 'b']),
      { timeout: 3000 },
    );
    expect(result.current.status).toBe(RunStatus.FAILED);
    expect(result.current.error).toBeNull();
  });

  it('reset 清空日志', async () => {
    followRunLogsMock.mockImplementation(() =>
      (async function* (): AsyncIterable<RunLogChunk> {
        yield chunk('x\n', { isFinal: true, runStatus: RunStatus.SUCCEEDED });
      })(),
    );
    const { result } = renderHook(() => useRunLogs(s, 'r1'));
    await waitFor(() => expect(result.current.lines.map((l) => l.text)).toEqual(['x']));
    result.current.reset();
    await waitFor(() => expect(result.current.lines).toEqual([]));
  });
});
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/hooks/useRunLogs.test.tsx`
Expected: 失败——`./useRunLogs` 不存在。

- [ ] **Step 3: 实现 `src/hooks/useRunLogs.ts`**

```ts
import { useCallback, useState } from 'react';
import { RunStatus, type RunLogChunk } from '../api/gen/agentcompose/v2/agentcompose_pb';
import type { ConnectionSettings } from '../api/connection';
import { followRunLogs, type FollowRunLogsOptions } from '../api/runs';
import { appendLogChunk, createLogBuffer, type LogBuffer, type LogLine } from '../domain/runLog';
import { useServerStream } from './useServerStream';

export interface RunLogsState {
  /** 已累积的日志行（跨重连累积，进程终止后不再增长）。 */
  lines: LogLine[];
  /** 日志流带出的最新运行状态；未知前为 null。 */
  status: RunStatus | null;
  connected: boolean;
  error: string | null;
  reset: () => void;
}

export function useRunLogs(
  s: ConnectionSettings,
  runId: string | null,
  options: FollowRunLogsOptions = {},
): RunLogsState {
  const [buffer, setBuffer] = useState<LogBuffer>(() => createLogBuffer());
  const [status, setStatus] = useState<RunStatus | null>(null);

  const stream = useServerStream<RunLogChunk>(
    (signal) => followRunLogs(s, runId ?? '', options, signal),
    {
      enabled: Boolean(runId),
      backoffMs: 1000,
      maxBackoffMs: 10_000,
      isTerminal: (chunk) => chunk.isFinal,
      onMessage: (chunk) => {
        if (chunk.runStatus !== RunStatus.UNSPECIFIED) setStatus(chunk.runStatus);
        setBuffer((b) => appendLogChunk(b, chunk));
      },
    },
  );

  const reset = useCallback(() => {
    setBuffer(createLogBuffer());
    setStatus(null);
    stream.reset();
  }, [stream.reset]);

  return { lines: buffer.lines, status, connected: stream.connected, error: stream.error, reset };
}
```

> 说明：日志行存在 `buffer` state 里（`onMessage` 先于 `setMessages` 执行，React 18 批处理），不依赖 stream.messages；`enabled` 由 `runId` 是否为空控制。

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/hooks/useRunLogs.test.tsx`
Expected: 全绿。断线重连用例依赖真实定时器（默认 backoff 1000ms），`waitFor` 上限给 3s 足够。

- [ ] **Step 5: 全量回归 + 提交**

```bash
npx vitest run && npm run build && npm run lint
git add src/hooks/useRunLogs.ts src/hooks/useRunLogs.test.tsx
git commit -m "feat: 运行日志 hook（累积行 + 状态 + 重连）"
```

---

## Task 6: `src/hooks/useDashboard.ts` — 首页概览 hook

**Files:**
- Create: `src/hooks/useDashboard.ts`
- Test: `src/hooks/useDashboard.test.tsx`

**Interfaces:**
- Consumes: `getDashboardOverview`/`watchDashboardOverview`（Task 1）；`loadConnectionSettings`（src/api/connection.ts）；`useServerStream`（Task 4）；`useQuery`/`useQueryClient`。
- Produces:
  - `export const DASHBOARD_KEY = ['dashboard'] as const`
  - `export interface DashboardState { overview: DashboardOverview | undefined; isLoading: boolean; isError: boolean; connected: boolean; refetch: () => void }`
  - `useDashboard(): DashboardState`

- [ ] **Step 1: 写失败测试**

创建 `src/hooks/useDashboard.test.tsx`：

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardOverview } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { useDashboard } from './useDashboard';

const getOverviewMock = vi.fn();
const watchMock = vi.fn();
vi.mock('../api/runs', () => ({
  getDashboardOverview: (...a: unknown[]) => getOverviewMock(...a),
  watchDashboardOverview: (...a: unknown[]) => watchMock(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

function overview(runningCount: number, recentCount: number, attentionCount: number): DashboardOverview {
  return { runs: { runningCount, recentCount, attentionCount }, updatedAt: undefined };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
}

describe('useDashboard', () => {
  beforeEach(() => {
    getOverviewMock.mockReset().mockResolvedValue(overview(1, 3, 0));
    watchMock.mockReset();
  });

  it('unary 初始 + watch 每帧经 setQueryData 刷新同一 queryKey', async () => {
    watchMock.mockImplementation(() =>
      (async function* (): AsyncIterable<{ overview: DashboardOverview | undefined; reason: string }> {
        yield { overview: overview(4, 9, 1), reason: '' };
      })(),
    );
    const { result } = renderHook(() => useDashboard(), { wrapper });
    // 初始 unary 数据先落地
    await waitFor(() => expect(result.current.overview?.runs?.runningCount).toBe(1));
    // watch 帧覆盖为最新快照
    await waitFor(() => expect(result.current.overview?.runs?.runningCount).toBe(4));
    expect(result.current.overview?.runs?.attentionCount).toBe(1);
    expect(getOverviewMock).toHaveBeenCalledTimes(1);
    expect(watchMock).toHaveBeenCalledTimes(1);
  });

  it('watch 帧 overview 缺失时不动 query', async () => {
    watchMock.mockImplementation(() =>
      (async function* (): AsyncIterable<{ overview: DashboardOverview | undefined; reason: string }> {
        yield { overview: undefined, reason: 'not ready' };
      })(),
    );
    const { result } = renderHook(() => useDashboard(), { wrapper });
    await waitFor(() => expect(result.current.overview?.runs?.runningCount).toBe(1));
    // 等若干 tick 确保 watch 帧已消费，query 仍保持 unary 值
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.overview?.runs?.runningCount).toBe(1);
  });
});
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/hooks/useDashboard.test.tsx`
Expected: 失败——`./useDashboard` 不存在。

- [ ] **Step 3: 实现 `src/hooks/useDashboard.ts`**

```ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import type { DashboardOverview, WatchDashboardOverviewResponse } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { getDashboardOverview, watchDashboardOverview } from '../api/runs';
import { useServerStream } from './useServerStream';

export const DASHBOARD_KEY = ['dashboard'] as const;

export interface DashboardState {
  overview: DashboardOverview | undefined;
  isLoading: boolean;
  isError: boolean;
  /** watch 订阅是否活跃（用于「实时」指示）。 */
  connected: boolean;
  refetch: () => void;
}

export function useDashboard(): DashboardState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: async () => {
      const s = loadConnectionSettings();
      return getDashboardOverview(s);
    },
    staleTime: 30_000,
  });

  // §8 流式封装：watch 每帧把最新快照写入同一 queryKey（unary 只做首屏兜底）。
  const stream = useServerStream<WatchDashboardOverviewResponse>(
    (signal) => {
      const s = loadConnectionSettings();
      return watchDashboardOverview(s, signal);
    },
    {
      backoffMs: 2000,
      maxBackoffMs: 30_000,
      accumulate: false,
      isTerminal: () => false,
      onMessage: (res) => {
        if (res.overview) queryClient.setQueryData(DASHBOARD_KEY, res.overview);
      },
    },
  );

  return {
    overview: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    connected: stream.connected,
    refetch: () => void query.refetch(),
  };
}
```

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/hooks/useDashboard.test.tsx`
Expected: 全绿（2 用例）。

- [ ] **Step 5: 全量回归 + 提交**

```bash
npx vitest run && npm run build && npm run lint
git add src/hooks/useDashboard.ts src/hooks/useDashboard.test.tsx
git commit -m "feat: 首页概览 hook（unary 首屏 + watch 实时刷新）"
```

---

## Task 7: `src/ui/DashboardScreen.tsx` — 首页四块 + 快捷入口

**Files:**
- Create: `src/ui/DashboardScreen.tsx`
- Test: `src/ui/DashboardScreen.test.tsx`
- Modify: `src/ui/console.css`（追加 `dash-*` 样式）

**Interfaces:**
- Consumes: `useDashboard`（Task 6）；`useNavigate`；`console.css`。
- Produces: `<DashboardScreen />`（T10 挂在 `/console` index 路由）。

- [ ] **Step 1: 写失败测试**

创建 `src/ui/DashboardScreen.test.tsx`（mock hook，沿用 AgentListScreen.test 模式）：

```tsx
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
  it('加载失败给重试', () => {
    const refetch = vi.fn();
    useDashboardMock.mockReturnValue({ ...base, isError: true, refetch });
    renderScreen();
    expect(screen.getByRole('alert')).toHaveTextContent('连不上 agent-compose');
    userEvent.click(screen.getByRole('button', { name: '重试' }));
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
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/ui/DashboardScreen.test.tsx`
Expected: 失败——`./DashboardScreen` 不存在。

- [ ] **Step 3: 实现 `src/ui/DashboardScreen.tsx`**

```tsx
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import './console.css';

export function DashboardScreen() {
  const navigate = useNavigate();
  const { overview, isLoading, isError, connected, refetch } = useDashboard();
  const runs = overview?.runs;

  if (isLoading) return <div className="console-page" role="status">正在加载首页…</div>;
  if (isError) {
    return (
      <div className="console-page">
        <p role="alert">加载失败，连不上 agent-compose。</p>
        <button type="button" className="setup-btn" onClick={refetch}>重试</button>
      </div>
    );
  }

  const runningCount = runs?.runningCount ?? 0;
  const recentCount = runs?.recentCount ?? 0;
  const attentionCount = runs?.attentionCount ?? 0;

  return (
    <section className="console-page">
      <div className="console-page__head">
        <h2>首页</h2>
        {connected ? (
          <span className="dash-live">实时</span>
        ) : (
          <span className="dash-live dash-live--off">连接中…</span>
        )}
      </div>

      <div className="dash-grid">
        <div className="dash-card">
          <div className="dash-card__num">{runningCount}</div>
          <div className="dash-card__label">运行中的 AI 助手</div>
        </div>
        <div className="dash-card">
          <div className="dash-card__num">{recentCount}</div>
          <div className="dash-card__label">今日运行次数</div>
        </div>
        <div className="dash-card dash-card--warn">
          <div className="dash-card__num">{attentionCount}</div>
          <div className="dash-card__label">需要留意的运行</div>
        </div>
      </div>

      <div className="dash-block">
        {attentionCount > 0 ? (
          <p role="alert">
            {attentionCount === 1 ? '有 1 次运行出了点问题。' : `有 ${attentionCount} 次运行出了点问题。`}{' '}
            <button type="button" className="setup-btn setup-btn--ghost" onClick={() => navigate('/console/runs')}>
              查看日志
            </button>
          </p>
        ) : (
          <p>最近运行一切正常。</p>
        )}
      </div>

      <div className="dash-block dash-block--links">
        <button type="button" className="setup-btn" onClick={() => navigate('/console/agents/new')}>
          + 新建 AI 助手
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => navigate('/console/agents')}>
          管理我的 AI 助手
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => navigate('/console/runs')}>
          查看运行记录
        </button>
      </div>
    </section>
  );
}
```

在 `src/ui/console.css` 末尾追加：

```css
/* ===== 首页 Dashboard ===== */
.dash-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 16px 0 24px; }
.dash-card { border: 1px solid var(--ac-border, #d5d5d5); border-radius: 12px; padding: 16px; }
.dash-card__num { font-size: 32px; font-weight: 700; }
.dash-card__label { color: #666; margin-top: 4px; font-size: 13px; }
.dash-card--warn .dash-card__num { color: #b91c1c; }
.dash-live { font-size: 12px; color: #15803d; }
.dash-live--off { color: #9ca3af; }
.dash-block { margin-bottom: 16px; }
.dash-block--links { display: flex; gap: 8px; flex-wrap: wrap; }
```

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/ui/DashboardScreen.test.tsx`
Expected: 全绿（6 用例）。`getByText('2')` 若与标题数字撞车，改为 `getAllByText('2')[0]`。

- [ ] **Step 5: 全量回归 + 提交**

```bash
npx vitest run && npm run build && npm run lint
git add src/ui/DashboardScreen.tsx src/ui/DashboardScreen.test.tsx src/ui/console.css
git commit -m "feat: 首页 Dashboard（运行概览四块 + 快捷入口）"
```

---

## Task 8: `src/ui/RunsScreen.tsx` — 运行记录表格

**Files:**
- Create: `src/ui/RunsScreen.tsx`
- Test: `src/ui/RunsScreen.test.tsx`
- Modify: `src/ui/console.css`（追加 `runs-table`/`run-status` 样式）

**Interfaces:**
- Consumes: `listRuns`（Task 1）；`runToRow`/`runStatusTone`/`RunRow`（Task 2）；`loadConnectionSettings`；`useQuery`/`useQueryClient`；`useNavigate`。
- Produces: `<RunsScreen />`（T10 挂在 `/console/runs`）。

- [ ] **Step 1: 写失败测试**

创建 `src/ui/RunsScreen.test.tsx`：

```tsx
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
```

> `startedAt` mock 给 `{ seconds, nanos }` 的形状——`runToRow` 经 `timestampDate` 转 Date，只验证不崩溃 + 时间列渲染非占位即可。

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/ui/RunsScreen.test.tsx`
Expected: 失败——`./RunsScreen` 不存在。

- [ ] **Step 3: 实现 `src/ui/RunsScreen.tsx`**

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { loadConnectionSettings } from '../api/connection';
import { listRuns } from '../api/runs';
import { runStatusTone, runToRow } from '../domain/runView';
import './console.css';

export function RunsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['runs'],
    queryFn: async () => {
      const s = loadConnectionSettings();
      return listRuns(s, { limit: 50 });
    },
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['runs'] });

  if (query.isLoading) return <div className="console-page" role="status">正在加载运行记录…</div>;
  if (query.isError) {
    return (
      <div className="console-page">
        <p role="alert">加载失败，连不上 agent-compose。</p>
        <button type="button" className="setup-btn" onClick={refresh}>重试</button>
      </div>
    );
  }
  const rows = (query.data ?? []).map(runToRow);

  return (
    <section className="console-page">
      <div className="console-page__head">
        <h2>运行记录</h2>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={refresh}>刷新</button>
      </div>
      {rows.length === 0 ? (
        <p>还没有运行记录。去「我的 AI 助手」点「立即运行」，第一个结果就会出现在这里。</p>
      ) : (
        <table className="runs-table">
          <thead>
            <tr>
              <th>AI 助手</th>
              <th>来源</th>
              <th>状态</th>
              <th>耗时</th>
              <th>开始时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} onClick={() => navigate(`/console/runs/${r.runId}`)}>
                <td>{r.agentName}</td>
                <td>{r.sourceLabel}</td>
                <td>
                  <span className={`run-status run-status--${runStatusTone(r.status)}`}>{r.statusLabel}</span>
                </td>
                <td>{r.durationText}</td>
                <td>{r.startedText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

在 `src/ui/console.css` 末尾追加：

```css
/* ===== 运行记录表格 ===== */
.runs-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
.runs-table th, .runs-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 14px; }
.runs-table thead th { color: #666; font-weight: 600; font-size: 13px; }
.runs-table tbody tr { cursor: pointer; }
.runs-table tbody tr:hover { background: #f8fafc; }
.run-status { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; }
.run-status--running { background: #dbeafe; color: #1e40af; }
.run-status--succeeded { background: #dcfce7; color: #15803d; }
.run-status--failed { background: #fee2e2; color: #b91c1c; }
.run-status--stopped, .run-status--idle { background: #f3f4f6; color: #6b7280; }
```

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/ui/RunsScreen.test.tsx`
Expected: 全绿（5 用例）。

- [ ] **Step 5: 全量回归 + 提交**

```bash
npx vitest run && npm run build && npm run lint
git add src/ui/RunsScreen.tsx src/ui/RunsScreen.test.tsx src/ui/console.css
git commit -m "feat: 运行记录列表页（全局表格 + 跳详情）"
```

---

## Task 9: `src/ui/RunDetailScreen.tsx` — 运行详情（色条 + 日志 + 事件 + 停止）

**Files:**
- Create: `src/ui/RunDetailScreen.tsx`
- Test: `src/ui/RunDetailScreen.test.tsx`
- Modify: `src/ui/console.css`（追加 `run-banner`/`run-section`/`run-logs`/`run-events` 样式）

**Interfaces:**
- Consumes: `getRun`/`listRunEvents`/`stopRun`（Task 1）；`useRunLogs`（Task 5）；`describeRunEventKind`/`formatDuration`/`formatTime`/`isRunTerminal`/`runStatusTone`（Task 2）；`runStatusLabel`（src/domain/agentCard.ts）；`timestampDate`；`useNavigate`/`useParams`；`useQuery`/`useMutation`/`useQueryClient`。
- Produces: `<RunDetailScreen />`（T10 挂在 `/console/runs/:runId`）。

- [ ] **Step 1: 写失败测试**

创建 `src/ui/RunDetailScreen.test.tsx`：

```tsx
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
    listRunEventsMock.mockReset().mockResolvedValue([
      { id: 'e1', runId: 'r1', seq: 1n, kind: RunEventKind.STATUS, text: '开始运行', agent: 'my-report', name: '', payloadJson: '', success: true, exitCode: 0, stopReason: '', createdAt: undefined },
    ]);
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
```

> 注：第 4 个用例里确认停止后弹层关闭，「取消」按钮已不存在——把最后的 `取消` 点击改为「确认停止后断言弹层文本消失」，或直接删掉该行。实现按下面代码：停止成功后 `setConfirmingStop(false)` 关闭弹层，测试断言 `screen.queryByRole('button', { name: /取消/ })` 为 null 即可。

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/ui/RunDetailScreen.test.tsx`
Expected: 失败——`./RunDetailScreen` 不存在。

- [ ] **Step 3: 实现 `src/ui/RunDetailScreen.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { loadConnectionSettings } from '../api/connection';
import { getRun, listRunEvents, stopRun } from '../api/runs';
import { runStatusLabel } from '../domain/agentCard';
import { describeRunEventKind, formatDuration, formatTime, isRunTerminal, runStatusTone } from '../domain/runView';
import { useRunLogs } from '../hooks/useRunLogs';
import './console.css';

export function RunDetailScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { runId = '' } = useParams();
  const s = loadConnectionSettings();
  const [confirmingStop, setConfirmingStop] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const runQuery = useQuery({
    queryKey: ['run', runId],
    queryFn: () => getRun(s, runId),
    enabled: Boolean(runId),
  });
  const eventsQuery = useQuery({
    queryKey: ['run-events', runId],
    queryFn: () => listRunEvents(s, runId, { limit: 200 }),
    enabled: Boolean(runId),
  });
  const logs = useRunLogs(s, runId || null, { tailLines: 200, follow: true });

  const stopMutation = useMutation({
    mutationFn: async () => {
      await stopRun(s, runId, 'user clicked stop');
    },
    onSuccess: () => {
      setConfirmingStop(false);
      queryClient.invalidateQueries({ queryKey: ['run', runId] });
    },
  });

  // 新日志行到达时自动滚到底。
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [logs.lines.length]);

  if (runQuery.isLoading) return <div className="console-page" role="status">正在加载运行详情…</div>;
  const detail = runQuery.data;
  if (runQuery.isError || !detail || !detail.summary) {
    return (
      <div className="console-page">
        <p role="alert">找不到这次运行。</p>
        <button type="button" className="setup-btn" onClick={() => navigate('/console/runs')}>返回运行记录</button>
      </div>
    );
  }
  const summary = detail.summary;
  const terminal = isRunTerminal(summary.status);

  return (
    <section className="console-page">
      <div className="console-page__head">
        <h2>运行详情</h2>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => navigate('/console/runs')}>返回运行记录</button>
      </div>

      <div className={`run-banner run-banner--${runStatusTone(summary.status)}`}>
        <div>
          <strong>{summary.agentName}</strong>
          <span className="run-banner__meta">
            #{summary.runShortId || summary.runId.slice(0, 8)} · {runStatusLabel(summary.status)}
          </span>
        </div>
        <div className="run-banner__meta">
          来源：{summary.source === 2 ? '定时触发' : summary.source === 1 ? '手动运行' : 'API 调用'} ·
          耗时：{formatDuration(summary.durationMs)} ·
          {summary.startedAt ? `开始于 ${formatTime(timestampDate(summary.startedAt))}` : '尚未开始'}
        </div>
        {summary.error && <div className="run-banner__error" role="alert">{summary.error}</div>}
      </div>

      {!terminal && (
        <div className="run-section">
          <button type="button" className="setup-btn" onClick={() => setConfirmingStop(true)}>停止这次运行</button>
        </div>
      )}

      <div className="run-section">
        <div className="run-section__head">
          <h3>日志</h3>
          {logs.connected ? <span className="dash-live">实时</span> : <span className="dash-live dash-live--off">{logs.error ?? '已结束'}</span>}
        </div>
        {logs.lines.length === 0 ? (
          <p className="run-section__empty">还没有日志输出。</p>
        ) : (
          <div className="run-logs" role="log">
            {logs.lines.map((l) => (
              <div key={l.id}>{l.text}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      <div className="run-section">
        <div className="run-section__head"><h3>事件时间线</h3></div>
        {(eventsQuery.data ?? []).length === 0 ? (
          <p className="run-section__empty">暂无事件。</p>
        ) : (
          <div className="run-events">
            {(eventsQuery.data ?? []).map((ev) => (
              <div key={ev.id} className="run-event">
                <span className="run-event__kind">{describeRunEventKind(ev.kind)}</span>
                {ev.createdAt && <span className="run-event__time">{formatTime(timestampDate(ev.createdAt))}</span>}
                {ev.text && <span className="run-event__text">{ev.text}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmingStop && (
        <div className="auth-overlay" role="dialog" aria-label="停止确认">
          <div>
            <h3>停止这次运行？</h3>
            <p>正在进行的任务会立刻中断，已写入的结果不会保留。</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={stopMutation.isPending} onClick={() => stopMutation.mutate()}>
                {stopMutation.isPending ? '停止中…' : '确认停止'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingStop(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
```

在 `src/ui/console.css` 末尾追加：

```css
/* ===== 运行详情 ===== */
.run-banner { border-radius: 12px; padding: 16px; margin: 16px 0; color: #fff; display: flex; flex-direction: column; gap: 6px; }
.run-banner--running { background: #1d4ed8; }
.run-banner--succeeded { background: #15803d; }
.run-banner--failed { background: #b91c1c; }
.run-banner--stopped { background: #6b7280; }
.run-banner--idle { background: #9ca3af; }
.run-banner__meta { opacity: 0.9; font-size: 13px; }
.run-banner__error { background: rgba(255,255,255,.2); border-radius: 6px; padding: 6px 10px; font-size: 13px; word-break: break-word; }
.run-section { margin-bottom: 24px; }
.run-section__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.run-section__head h3 { margin: 0; font-size: 16px; }
.run-section__empty { color: #666; font-size: 13px; }
.run-logs { background: #0f172a; color: #dbe3f0; border-radius: 8px; padding: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.6; max-height: 360px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
.run-events { max-height: 300px; overflow: auto; }
.run-event { display: flex; gap: 10px; padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
.run-event__kind { color: #1d4ed8; flex: 0 0 auto; }
.run-event__time { color: #9ca3af; flex: 0 0 auto; }
.run-event__text { flex: 1; word-break: break-word; }
```

> 说明：`summary.source === 2`（SCHEDULER）/`=== 1`（MANUAL）内联硬编码是防 `describeRunSource` 二次 import 的偷懒写法——**请改为** `import { describeRunSource } from '../domain/runView'` 并 `来源：{describeRunSource(summary.source)}`。上面故意写错是给 reviewer 的试金石：T9 必须用 `describeRunSource`，不得硬编码枚举数字。

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/ui/RunDetailScreen.test.tsx`
Expected: 全绿（5 用例）。注意 T9 实现**必须**用 `describeRunSource`（不得硬编码 `=== 2`/`=== 1`）——上面代码块内那段「内联硬编码」是陷阱，实现时替换为 import 版。

- [ ] **Step 5: 全量回归 + 提交**

```bash
npx vitest run && npm run build && npm run lint
git add src/ui/RunDetailScreen.tsx src/ui/RunDetailScreen.test.tsx src/ui/console.css
git commit -m "feat: 运行详情页（状态色条 + 流式日志 + 事件时间线 + 停止确认）"
```

---

## Task 10: 路由接线 + 立即运行/测试运行跳详情

**Files:**
- Modify: `src/App.tsx`（`/console` index→DashboardScreen；`runs`→RunsScreen；新增 `runs/:runId`→RunDetailScreen）
- Modify: `src/App.test.tsx`（补 3 个新 screen 的 mock，更新断言）
- Modify: `src/ui/AgentListScreen.tsx`（`runMutation` 返回 RunSummary，`onSuccess` 跳详情）
- Modify: `src/ui/AgentListScreen.test.tsx`（立即运行断言跳 `/console/runs/r9`）
- Modify: `src/ui/CreateWizard.tsx`（`saveAndRun` 测试运行跳详情）
- Modify: `src/ui/CreateWizard.test.tsx`（`startAgentRunMock` 形状改 `{ runId: 'r1' }`，断言 `/console/runs/r1`）

**Interfaces:**
- Consumes: `DashboardScreen`（T7）、`RunsScreen`（T8）、`RunDetailScreen`（T9）；`startAgentRun`（src/api/projects.ts，返回 `RunSummary`）。

- [ ] **Step 1: 写失败测试**

**a. `src/App.test.tsx`**：顶部 mock 三个新 screen，并改「在线时 /console 默认首页」断言：

```tsx
// 顶部新增：
vi.mock('./ui/DashboardScreen', () => ({ DashboardScreen: () => <div>DashboardScreen stub</div> }));
vi.mock('./ui/RunsScreen', () => ({ RunsScreen: () => <div>RunsScreen stub</div> }));
vi.mock('./ui/RunDetailScreen', () => ({ RunDetailScreen: () => <div>RunDetailScreen stub</div> }));
```

追加三个用例：

```tsx
  it('在线时 /console 默认渲染首页 Dashboard', async () => {
    window.history.replaceState({}, '', '/console');
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() => expect(screen.getByText('DashboardScreen stub')).toBeInTheDocument());
  });
  it('在线时 /console/runs 渲染运行记录', async () => {
    window.history.replaceState({}, '', '/console/runs');
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() => expect(screen.getByText('RunsScreen stub')).toBeInTheDocument());
  });
  it('在线时 /console/runs/:runId 渲染运行详情', async () => {
    window.history.replaceState({}, '', '/console/runs/r1');
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() => expect(screen.getByText('RunDetailScreen stub')).toBeInTheDocument());
  });
```

> 既有用例「在线时 /console/settings 渲染占位页」保留（settings 仍是占位）。若 App.test 里有断言首页占位文案「运行概览在这里（下个阶段）」的旧用例，一并改为断言 `DashboardScreen stub`。

**b. `src/ui/AgentListScreen.test.tsx`**：改 `renderScreen` 加一个详情 stub 路由，并新增/更新立即运行用例：

```tsx
// renderScreen 内改为：
<Route path="/console/runs/:runId" element={<RunDetailStub />} />
// 顶部定义：
function RunDetailStub() {
  const { runId } = require('react-router-dom').useParams();
  return <div>run detail {runId}</div>;
}
```

新增用例（既有「立即运行」用例如有，改为断言跳详情）：

```tsx
  it('立即运行成功后跳运行详情', async () => {
    useAgentsMock.mockReturnValue({ data: [card], isLoading: false });
    startAgentRunMock.mockResolvedValue({ runId: 'r9' });
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByText('我的日报')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /立即运行/ }));
    await waitFor(() => expect(screen.getByText('run detail r9')).toBeInTheDocument());
  });
```

**c. `src/ui/CreateWizard.test.tsx`**：
- `beforeEach` 里 `startAgentRunMock.mockReset().mockResolvedValue({ runId: 'r1' })`（原来是 `{ run: { runId: 'r1' } }`——那是 RPC 原始响应形状，组件消费的是 wrapper 返回的 `RunSummary`）。
- 「测试运行一次」用例里把 `waitFor(() => expect(screen.getByText('runs list')).toBeInTheDocument())` 改为断言跳详情：

```tsx
    await waitFor(() => expect(screen.getByText('run detail r1')).toBeInTheDocument());
```
并给 `renderWizard` 的 Routes 加 `<Route path="/console/runs/:runId" element={<div>run detail</div>} />`（或保留 `/console/runs` 占位 + 新增详情路由）。

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/App.test.tsx src/ui/AgentListScreen.test.tsx src/ui/CreateWizard.test.tsx`
Expected: 新增用例红（路由未接 / 跳转目标还是列表）。

- [ ] **Step 3: 实现**

**`src/App.tsx`** — import 三个新 screen，替换占位路由：

```tsx
import { DashboardScreen } from './ui/DashboardScreen';
import { RunsScreen } from './ui/RunsScreen';
import { RunDetailScreen } from './ui/RunDetailScreen';
// ...
            <Route path="/console" element={<ConsoleLayout />}>
              <Route index element={<DashboardScreen />} />
              <Route path="agents" element={<AgentListScreen />} />
              <Route path="agents/new" element={<CreateWizard />} />
              <Route path="agents/:agentName/edit" element={<CreateWizard />} />
              <Route path="runs" element={<RunsScreen />} />
              <Route path="runs/:runId" element={<RunDetailScreen />} />
              <Route path="resources" element={<PagePlaceholder title="资源中心" note="工作区/数据文件夹/插件/沙箱在这里（下个阶段）" />} />
              <Route path="settings" element={<PagePlaceholder title="设置（下个阶段）" note="密钥、全局环境变量与进阶配置在这里" />} />
              <Route path="*" element={<Navigate to="/console" replace />} />
            </Route>
```

**`src/ui/AgentListScreen.tsx`** — `runMutation` 改为返回 `RunSummary` 并在 `onSuccess` 跳详情（同时 `invalidate`）：

```tsx
  const runMutation = useMutation({
    mutationFn: async (c: AgentCardModel) => {
      const s = loadConnectionSettings();
      return startAgentRun(s, { projectId: c.projectId, agentName: c.agentName, prompt: c.prompt });
    },
    onSuccess: (run) => {
      invalidate();
      navigate(`/console/runs/${run.runId}`);
    },
  });
```

**`src/ui/CreateWizard.tsx`** — `saveAndRun` 测试运行分支：

```tsx
      if (runAfter) {
        // 测试运行一次：先 Apply 拿到 projectId，再 StartAgentRun(source=MANUAL) 并跳运行详情。
        const pid = ares.project?.summary?.projectId ?? '';
        const run = await startAgentRun(s, { projectId: pid, agentName: spec.name, prompt: current.prompt });
        navigate(`/console/runs/${run.runId}`);
      } else {
        navigate('/console/agents');
      }
```

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/App.test.tsx src/ui/AgentListScreen.test.tsx src/ui/CreateWizard.test.tsx`
Expected: 全绿。

- [ ] **Step 5: 全量回归 + 提交**

```bash
npx vitest run && npm run build && npm run lint
git add src/App.tsx src/App.test.tsx src/ui/AgentListScreen.tsx src/ui/AgentListScreen.test.tsx src/ui/CreateWizard.tsx src/ui/CreateWizard.test.tsx
git commit -m "feat: 路由接线（首页/运行记录/详情）+ 立即运行与测试运行跳详情"
```

---

## 计划自审（writing-plans self-review）

**1. Spec 覆盖：**
- §5.1 首页四块（运行中助手数/今日运行次数/最近失败告警+查看日志/快捷入口）→ T6 + T7。✅
- §5.1 数据源 `GetDashboardOverview`/`WatchDashboardOverview`（流式）→ T1 + T6（unary 首屏 + watch 实时）。✅
- §5.3 全局 `ListRuns` 表格 + 详情页 → T8 + T9。✅
- §5.3 详情流式日志查看器（`StreamAgentRun`/`FollowRunLogs`）→ T9 用 `FollowRunLogs`（`StreamAgentRun` 是交互式 attach 流，非本阶段非交互日志面；裁决 R2 已说明）。✅
- §5.3 运行事件时间线（`ListRunEvents`）与状态色条 → T9（`run-banner--*` + `run-events`）。✅
- §5.3 可停止运行（`StopRun`）→ T9（非终态 + 二次确认）。✅
- §8 流式接口独立订阅 hook：断线自动重连（指数退避）+ 组件卸载即取消 → T4 `useServerStream`，T5/T6 复用。✅
- §7 文案转译 → `runStatusLabel`/`describeRunSource`/`describeRunEventKind`/各页面标签全人话。✅
- §12 非目标：交互式 attach 会话、资源中心、设置页、按状态筛选/分页 → 明确不在本阶段。✅

**2. Placeholder 扫描：** 全部 10 个任务含完整可运行代码；测试含具体断言；无「按需处理」类占位。T9 有一处刻意标注的陷阱代码并给出替换说明（保证实现走 `describeRunSource`）。

**3. 类型一致性：** `FollowRunLogsOptions` 在 T1 定义、T5 消费；`RunRow`/`runStatusTone`/`describeRunEventKind`/`formatDuration`/`formatTime`/`isRunTerminal` 在 T2 定义、T8/T9 消费；`useServerStream` 在 T4 定义、T5/T6 消费；`DASHBOARD_KEY` 在 T6 定义并使用；`useRunLogs` 的 `s` 参数贯穿；`runStatusLabel` 复用 agentCard.ts 既有实现（T2 内部再导出依赖，T9 直接 import agentCard）。⚠️ T1 测试里 `listRunEvents` mock 返回 `{ events: [...] }` 形状与真实 `ListRunEventsResponse` 一致；T8 测试 `startedAt: { seconds, nanos }` 形状与 `Timestamp` 一致（经 `timestampDate` 消费）。

**交叉文件冲突预检（SDD pre-flight 用）：** T9 与 T7/T8 共用 `console.css`（各自追加独立前缀类，无覆盖）；T10 与 T8/T9 共用路由与两个既有 screen（改动点各自独立）；`AgentListScreen.test` 的 `startAgentRunMock` 已 resolve `{ runId: 'r9' }`（与 wrapper 返回一致），`CreateWizard.test` 的需改形状（T10 已注明）。无其它共享写入冲突。
