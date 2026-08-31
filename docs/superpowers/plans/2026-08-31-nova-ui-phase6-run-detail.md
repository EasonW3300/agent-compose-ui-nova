# Phase 6 运行详情增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强运行全链路：运行详情页支持手动重试一次、日志带时间戳与复制、事件时间线支持筛选/分页/失败详情/载荷展开；运行列表页支持行内停止与再次运行、运行中自动刷新。

**Architecture:** API 层（`src/api/runs.ts`）提供 `retryRun`、`listRunEvents` 分页返回与日志元数据透传；domain 层（`runLog.ts` 时间戳、`runView.ts` 时间与自动刷新判定）承载转译逻辑；hook `useRunLogs` 已透传 options 无需改动；UI 层 `RunDetailScreen`（重试/日志/事件三块）与 `RunsScreen`（列/操作/刷新）分别消费。全部走既有 `createDaemonTransport` + `@tanstack/react-query@^5` + 中文 copy + `console.css`。

**Tech Stack:** React + Vite + TS（strict）、@tanstack/react-query@^5、connect-web v2.1.2、vitest + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-08-31-nova-ui-phase6-run-detail-design.md`

## Global Constraints

- 永不修改 `src/api/gen/**`（只 import 类型）。
- 新依赖仅 `@tanstack/react-query@^5`（本轮不加新依赖）。
- 文案全中文；`labels.ts` TERMS 本轮无需增补（复用既有「停止/运行」等，新 UI 文案为常量中文，非术语表词）。
- strict `npm run build`（tsc -b && vite build）+ `npm run lint`（oxlint）全绿零警告（vite >500kB chunk info 不是失败）。
- 401 → 既有 global authInterceptor → UNAUTHORIZED_EVENT → AuthOverlay（新 mutation 全走既有 wrapper，无需新 transport）。
- 永不裸 `npx vitest`（watch 挂起；必须 `npx vitest run <file>`；全量 `npx vitest run --testTimeout=30000`）。
- 危险操作（停止）二次确认 + 人话后果；「重新运行」不破坏任何东西，无需确认。
- test mock 必须匹配 wrapper 返回形状（plain objects），非 RPC 原始形状；构造 protobuf Message 用 `create(Schema, {...})`。
- 每任务提交前：聚焦测试绿 + 全量回归 + build + lint 全绿。

---

### Task 1: 运行 API 层（retryRun / listRunEvents 分页 / 日志元数据透传）

**Files:**
- Modify: `src/api/runs.ts`
- Modify: `src/api/runs.test.ts`
- Modify: `src/ui/RunDetailScreen.tsx`（**契约同步**：仅两处 `eventsQuery.data ?? []` → `eventsQuery.data?.events ?? []`，见 Step 3 注）
- Modify: `src/ui/RunDetailScreen.test.tsx`（**契约同步**：`beforeEach` 的 `listRunEventsMock` 形状改对象，见 Step 3 注）

**Interfaces:**
- Consumes: `getRun`（runs.ts 既有）、`startAgentRun`（`src/api/projects.ts` 既有，`startAgentRun(s, { projectId, agentName, prompt })` 返回 `Promise<RunSummary>`）、gen `RunSummary`/`RunEvent`/`RunLogChunk` 类型。
- Produces（供后续任务消费）:
  - `retryRun(s: ConnectionSettings, runId: string): Promise<RunSummary>`
  - `ListRunEventsResult { events: RunEvent[]; total: number; historyAvailable: boolean }`（export）
  - `listRunEvents(s, runId, opts?: { limit?: number; offset?: number }): Promise<ListRunEventsResult>`
  - `FollowRunLogsOptions` 增加 `includeMetadata?: boolean`（默认 false）；`followRunLogs` 透传给 gen `include_metadata`
- 消费方预告：T3/T6 用 `retryRun`；T5 用 `listRunEvents` 新形状（T1 已同步组件消费，T5 聚焦增强）；T4 用 `followRunLogs` 元数据。

- [ ] **Step 1: 改/写失败测试**

`src/api/runs.test.ts` 三处改动：

**(a)** 顶部加 `startAgentRunMock` 并在 `createClient` mock 对象里加 `startAgentRun` 方法（`retryRun` 内部走 `projects.ts` 的 `runClient(s).startAgentRun(...)`，而 mock 的 createClient 对所有 service 返回同一对象，必须显式提供）：

```tsx
const startAgentRunMock = vi.fn();
// createClient 返回对象里追加一行（与其他 unary 方法并列）：
        startAgentRun: (...a: unknown[]) => withInterceptors(() => startAgentRunMock(...a)),
```

**(b)** `listRunEvents` 契约测试（现第 103-108 行）整体替换为「返回对象 + 透传 offset」：

```tsx
  it('listRunEvents 透传 limit/offset 并返回 { events, total, historyAvailable }', async () => {
    listRunEventsMock.mockResolvedValue({ events: [{ id: 'e1', runId: 'r1', seq: 1n }], total: 5, historyAvailable: true });
    const res = await listRunEvents(s, 'r1', { limit: 50, offset: 20 });
    expect(res).toEqual({ events: [{ id: 'e1', runId: 'r1', seq: 1n }], total: 5, historyAvailable: true });
    expect(listRunEventsMock).toHaveBeenCalledWith({ runId: 'r1', limit: 50, offset: 20 });
  });
```

**(c)** `followRunLogs` 加一条「includeMetadata:true 透传」用例（既有两条 `includeMetadata: false` 默认断言不变）：

```tsx
  it('followRunLogs includeMetadata:true 时透传元数据开关', () => {
    followRunLogs(s, 'r1', { includeMetadata: true }, undefined);
    expect(followRunLogsMock).toHaveBeenCalledWith(
      { runId: 'r1', projectId: '', tailLines: 200, tailSet: false, startOffset: 0n, follow: true, includeMetadata: true },
      undefined,
    );
  });
```

**(d)** 末尾追加 `retryRun` 两条用例（`retryRun` 从 `./runs` import；`getRun`/`startAgentRun` 均已 mock）：

```tsx
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
```
> `getRun` wrapper 返回 `res.run`（RPC 响应形状），mock 必须包 `run:`——此处已修正（此前版本漏包，属计划缺陷，已同步）。

  it('retryRun 找不到 detail 抛人话错误', async () => {
    getRunMock.mockResolvedValue(undefined);
    await expect(retryRun(s, 'r1')).rejects.toThrow('运行不存在');
  });
```

`runs.test.ts` 顶部 import 增加 `retryRun`。`beforeEach` 给 `startAgentRunMock.mockReset()`。

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/api/runs.test.ts`
Expected: FAIL（`retryRun` 不存在；listRunEvents 断言 `toEqual` 对象失败——现返回数组；includeMetadata 用例请求形状不符）。

- [ ] **Step 3: 实现**

`src/api/runs.ts`：

```ts
import { createClient } from '@connectrpc/connect';
import { createDaemonTransport, type ConnectionSettings } from './connection';
import { startAgentRun } from './projects';
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
```
> `./projects` 不 import `./runs`，无循环依赖。

`listRunEvents` 替换（现有函数整体改签名）：

```ts
export interface ListRunEventsResult {
  events: RunEvent[];
  total: number;
  historyAvailable: boolean;
}

export async function listRunEvents(
  s: ConnectionSettings,
  runId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<ListRunEventsResult> {
  const res = await runClient(s).listRunEvents({ runId, limit: opts.limit ?? 200, offset: opts.offset ?? 0 });
  return { events: res.events, total: res.total, historyAvailable: res.historyAvailable };
}
```

`followRunLogs` options 接口加字段 + 请求透传：

```ts
export interface FollowRunLogsOptions {
  tailLines?: number;
  follow?: boolean;
  includeMetadata?: boolean;
}
// 请求体里 includeMetadata: false 改为：
      includeMetadata: opts.includeMetadata ?? false,
```

`retryRun`（加在 `listRunEvents` 之后）：

```ts
/** 用某次运行的项目/助手/原 prompt 重起一次新 run（fire-and-forget）。 */
export async function retryRun(s: ConnectionSettings, runId: string): Promise<RunSummary> {
  const detail = await getRun(s, runId);
  if (!detail?.summary) throw new Error('运行不存在，无法重试');
  return startAgentRun(s, { projectId: detail.summary.projectId, agentName: detail.summary.agentName, prompt: detail.prompt });
}
```

**契约同步（必须同 commit，否则 tsc -b 全 src 红）：** `listRunEvents` 换返回对象后，`RunDetailScreen.tsx` 仍消费旧数组形状。最小修复两处：

`src/ui/RunDetailScreen.tsx` 事件渲染区块两处 `(eventsQuery.data ?? [])` 改为 `(eventsQuery.data?.events ?? [])`（`.length === 0` 判断处 + `.map` 处）。

`src/ui/RunDetailScreen.test.tsx` `beforeEach` 的 `listRunEventsMock.mockResolvedValue([...])` 改为返回对象：

```tsx
    listRunEventsMock.mockReset().mockResolvedValue({
      events: [
        { id: 'e1', runId: 'r1', seq: 1n, kind: RunEventKind.STATUS, text: '开始运行', agent: 'my-report', name: '', payloadJson: '', success: true, exitCode: 0, stopReason: '', createdAt: undefined },
      ],
      total: 1,
      historyAvailable: true,
    });
```
> 既有「渲染标题/状态标签/日志行/事件时间线」用例断言 `开始运行`/`状态变化` 在新形状下仍通过。此后 T5 的 Step 1(a) 已冗余，跳过。

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/api/runs.test.ts`
Expected: PASS。全量 `npx vitest run --testTimeout=30000` 无回归（`getRun`/`stopRun`/dashboard 用例不受影响）。

- [ ] **Step 5: 门禁 + 提交**

```bash
npm run build && npm run lint
git add src/api/runs.ts src/api/runs.test.ts
git commit -m "feat: 运行 API（retryRun / listRunEvents 分页 / 日志元数据透传）"
```

---

### Task 2: 运行 domain（日志时间戳 + formatClockTime + shouldAutoRefreshRuns）

**Files:**
- Modify: `src/domain/runLog.ts`
- Modify: `src/domain/runLog.test.ts`
- Modify: `src/domain/runView.ts`
- Modify: `src/domain/runView.test.ts`

**Interfaces:**
- Consumes: gen `RunLogChunk`（`createdAt?: Timestamp`）、`timestampDate`（`@bufbuild/protobuf/wkt`）、gen `RunSummary`/`RunStatus`。
- Produces:
  - `LogLine` 增加 `at?: Date`
  - `appendLogChunk` 把 `chunk.createdAt` 写入该 chunk 产生的每行
  - `formatClockTime(d: Date): string`（`HH:MM:SS`）
  - `shouldAutoRefreshRuns(runs: Pick<RunSummary, 'status'>[]): boolean`
- 消费方预告：T4 用 `LogLine.at` + `formatClockTime`；T6 用 `shouldAutoRefreshRuns`。`useRunLogs` 已把 `options` 整体透传给 `followRunLogs`，**无需改动**（T1 给 `FollowRunLogsOptions` 加字段后自动可用）。

- [ ] **Step 1: 写失败测试**

`src/domain/runLog.test.ts` 追加两条（既有 `chunk()` helper 已支持 `over` 覆盖字段，`createdAt` 默认 undefined，既有用例不受影响）：

```ts
  it('分片带 createdAt 时行带 at（同分片共享时间戳）', () => {
    let buf = createLogBuffer();
    const created = { seconds: 1785293700n, nanos: 0 };
    buf = appendLogChunk(buf, chunk('a\nb\n', { createdAt: created }));
    expect(buf.lines.map((l) => l.at?.getTime())).toEqual([1785293700000, 1785293700000]);
    expect(buf.lines[0].at).toBeInstanceOf(Date);
  });

  it('无 createdAt 时行不设 at', () => {
    let buf = createLogBuffer();
    buf = appendLogChunk(buf, chunk('a\n'));
    expect(buf.lines[0].at).toBeUndefined();
  });
```

`src/domain/runView.test.ts` import 增加 `formatClockTime`、`shouldAutoRefreshRuns`，追加：

```ts
  it('formatClockTime 输出 HH:MM:SS（本地时区）', () => {
    expect(formatClockTime(new Date(2026, 7, 27, 14, 5, 9))).toBe('14:05:09');
  });

  it('shouldAutoRefreshRuns：有非终态即 true，全终态 false', () => {
    expect(shouldAutoRefreshRuns([{ status: RunStatus.RUNNING }])).toBe(true);
    expect(shouldAutoRefreshRuns([{ status: RunStatus.SUCCEEDED }, { status: RunStatus.PENDING }])).toBe(true);
    expect(shouldAutoRefreshRuns([{ status: RunStatus.SUCCEEDED }, { status: RunStatus.FAILED }])).toBe(false);
    expect(shouldAutoRefreshRuns([])).toBe(false);
  });
```

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/domain/runLog.test.ts src/domain/runView.test.ts`
Expected: FAIL（`at` 不存在；`formatClockTime`/`shouldAutoRefreshRuns` undefined）。

- [ ] **Step 3: 实现**

`src/domain/runLog.ts`：

```ts
import { timestampDate } from '@bufbuild/protobuf/wkt';
import type { RunLogChunk } from '../api/gen/agentcompose/v2/agentcompose_pb';

export interface LogLine {
  id: number;
  text: string;
  at?: Date;
}
```
`appendLogChunk` 中 `newLines` 映射改为：

```ts
  const at = chunk.createdAt ? timestampDate(chunk.createdAt) : undefined;
  const newLines: LogLine[] = parts.map((text, i) => ({
    id: buf.nextId + i,
    text,
    ...(at ? { at } : {}),
  }));
```

`src/domain/runView.ts` 追加（`RunSummary` 已 import，`isRunTerminal` 同文件）：

```ts
/** 日志行时间戳：HH:MM:SS（本地时区）。 */
export function formatClockTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 运行列表是否值得自动刷新：存在任一非终态 run。 */
export function shouldAutoRefreshRuns(runs: Pick<RunSummary, 'status'>[]): boolean {
  return runs.some((r) => !isRunTerminal(r.status));
}
```

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/domain/runLog.test.ts src/domain/runView.test.ts`
Expected: PASS。全量 `npx vitest run --testTimeout=30000` 无回归。

- [ ] **Step 5: 门禁 + 提交**

```bash
npm run build && npm run lint
git add src/domain/runLog.ts src/domain/runLog.test.ts src/domain/runView.ts src/domain/runView.test.ts
git commit -m "feat: 运行 domain（日志时间戳 + formatClockTime + shouldAutoRefreshRuns）"
```

---

### Task 3: 运行详情——重新运行一次

**Files:**
- Modify: `src/ui/RunDetailScreen.tsx`
- Modify: `src/ui/RunDetailScreen.test.tsx`
- Modify: `src/ui/console.css`（追加 `.runs-actions`）

**Interfaces:**
- Consumes: `retryRun`（T1，`retryRun(s, runId): Promise<RunSummary>`）、`useMutation`/`useNavigate`/`useQueryClient`（均已 import）、`s = loadConnectionSettings()`（组件既有）。
- Produces: `RunDetailScreen` 头部「重新运行一次」按钮 + 失败 alert。`RunSummary` 的 `runId` 用于跳转。

- [ ] **Step 1: 改/写失败测试**

`src/ui/RunDetailScreen.test.tsx`：

**(a)** mock 工厂加 `retryRun`：

```tsx
const retryRunMock = vi.fn();
vi.mock('../api/runs', () => ({
  getRun: (...a: unknown[]) => getRunMock(...a),
  listRunEvents: (...a: unknown[]) => listRunEventsMock(...a),
  stopRun: (...a: unknown[]) => stopRunMock(...a),
  retryRun: (...a: unknown[]) => retryRunMock(...a),
}));
```

**(b)** `renderScreen` 的 Routes 增加 `/console/runs/:runId` stub（顶部加 helper + 路由）：

```tsx
function RunDetailStub() {
  const { runId } = useParams();
  return <div>run detail {runId}</div>;
}
// Routes 里：
        <Route path="/console/runs/:runId" element={<RunDetailStub />} />
```
> import 加 `useParams`。

**(c)** `beforeEach` 加：

```tsx
    retryRunMock.mockReset().mockResolvedValue({ ...summary(RunStatus.RUNNING), runId: 'r2', runShortId: 'r2' });
```

**(d)** 追加两条用例：

```tsx
  it('重新运行一次：调 retryRun 并跳转到新 run 详情', async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: /重新运行一次/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /重新运行一次/ }));
    await waitFor(() => expect(retryRunMock).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, 'r1'));
    await waitFor(() => expect(screen.getByText('run detail r2')).toBeInTheDocument());
  });

  it('重新运行失败给提示', async () => {
    retryRunMock.mockReset().mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: /重新运行一次/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /重新运行一次/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('重新运行失败'));
  });
```

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/ui/RunDetailScreen.test.tsx`
Expected: FAIL（无「重新运行一次」按钮；`retryRun` 未调用）。

- [ ] **Step 3: 实现**

`src/ui/RunDetailScreen.tsx`：

```tsx
import { getRun, listRunEvents, retryRun, stopRun } from '../api/runs';
```
组件内（`stopMutation` 之后）：

```tsx
  const retryMutation = useMutation({
    mutationFn: () => retryRun(s, runId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      navigate(`/console/runs/${run.runId}`);
    },
  });
```

头部（`console-page__head`）改为：

```tsx
      <div className="console-page__head">
        <h2>运行详情</h2>
        <div className="runs-actions">
          <button type="button" className="setup-btn" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
            {retryMutation.isPending ? '正在重新运行…' : '重新运行一次'}
          </button>
          <button type="button" className="setup-btn setup-btn--ghost" onClick={() => navigate('/console/runs')}>返回运行记录</button>
        </div>
      </div>
```

`run-banner` div 之后追加失败提示：

```tsx
      {retryMutation.isError && <div className="run-banner__error" role="alert">重新运行失败，请稍后再试。</div>}
```

`src/ui/console.css` 末尾追加：

```css
/* ===== 运行详情增强（Phase 6） ===== */
.runs-actions { display: flex; align-items: center; gap: 8px; }
```

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/ui/RunDetailScreen.test.tsx`
Expected: PASS。全量 `npx vitest run --testTimeout=30000` 无回归。

- [ ] **Step 5: 门禁 + 提交**

```bash
npm run build && npm run lint
git add src/ui/RunDetailScreen.tsx src/ui/RunDetailScreen.test.tsx src/ui/console.css
git commit -m "feat: 运行详情重新运行一次"
```

---

### Task 4: 运行详情——日志时间戳 + 复制

**Files:**
- Modify: `src/ui/RunDetailScreen.tsx`
- Modify: `src/ui/RunDetailScreen.test.tsx`
- Modify: `src/ui/console.css`（追加 `.run-log-line`/`.run-log-time`）

**Interfaces:**
- Consumes: `useRunLogs` 的 `includeMetadata` option（T1 加在 `FollowRunLogsOptions`，useRunLogs 已透传）、`LogLine.at`（T2）、`formatClockTime`（T2，从 `../domain/runView` import）。
- Produces: 日志行时间戳前缀 + 「复制日志」按钮。

- [ ] **Step 1: 改/写失败测试**

`src/ui/RunDetailScreen.test.tsx` 追加三条：

```tsx
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
    Object.assign(navigator, { clipboard: { writeText } });
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: '复制日志' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '复制日志' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('第 1 行'));
    await waitFor(() => expect(screen.getByText('已复制')).toBeInTheDocument());
  });
```
> jsdom 的 `navigator.clipboard` 默认 undefined；`Object.assign(navigator, { clipboard })` 注入 stub。既有 `useRunLogsMock` 默认返回的 lines 无 `at`，时间戳用例单独覆盖。

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/ui/RunDetailScreen.test.tsx`
Expected: FAIL（useRunLogs 未传 includeMetadata；无时间戳/复制按钮）。

- [ ] **Step 3: 实现**

`src/ui/RunDetailScreen.tsx`：

`import` 增加 `formatClockTime`：

```tsx
import { describeRunEventKind, describeRunSource, formatClockTime, formatDuration, formatTime, isRunTerminal, runStatusTone } from '../domain/runView';
```

`useRunLogs` 调用改：

```tsx
  const logs = useRunLogs(s, runId || null, { tailLines: 200, follow: true, includeMetadata: true });
```

`copied` 状态 + 复制 handler（组件内 state 声明区）：

```tsx
  const [copied, setCopied] = useState(false);

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs.lines.map((l) => l.text).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };
```

日志区块头 + 行渲染改：

```tsx
      <div className="run-section">
        <div className="run-section__head">
          <h3>日志</h3>
          <div className="runs-actions">
            {logs.connected ? <span className="dash-live">实时</span> : <span className="dash-live dash-live--off">{logs.error ?? '已结束'}</span>}
            <button type="button" className="setup-btn setup-btn--ghost" onClick={copyLogs} disabled={logs.lines.length === 0}>{copied ? '已复制' : '复制日志'}</button>
          </div>
        </div>
        {logs.lines.length === 0 ? (
          <p className="run-section__empty">还没有日志输出。</p>
        ) : (
          <div className="run-logs" role="log">
            {logs.lines.map((l) => (
              <div key={l.id} className="run-log-line">
                {l.at && <span className="run-log-time">{formatClockTime(l.at)}</span>}
                {l.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
```

`src/ui/console.css` 末尾追加：

```css
.run-log-line { white-space: pre-wrap; }
.run-log-time { color: #64748b; margin-right: 8px; user-select: none; }
```

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/ui/RunDetailScreen.test.tsx`
Expected: PASS。全量 `npx vitest run --testTimeout=30000` 无回归。

- [ ] **Step 5: 门禁 + 提交**

```bash
npm run build && npm run lint
git add src/ui/RunDetailScreen.tsx src/ui/RunDetailScreen.test.tsx src/ui/console.css
git commit -m "feat: 运行详情日志时间戳 + 复制"
```

---

### Task 5: 运行详情——事件时间线增强（筛选 / 分页 / 失败详情 / 载荷展开）

**Files:**
- Modify: `src/ui/RunDetailScreen.tsx`
- Modify: `src/ui/RunDetailScreen.test.tsx`
- Modify: `src/ui/console.css`（追加 `.run-events__*`/`.run-event__*` 类）

**Interfaces:**
- Consumes: `listRunEvents` 新返回形状（T1，`{ events, total, historyAvailable }`）、`RunEvent`/`RunEventKind` 类型（gen）、`describeRunEventKind`/`formatTime`/`timestampDate`（均有）。
- Produces: 事件区类型筛选 + 加载更多 + 失败详情 + payload 展开。

- [ ] **Step 1: 改/写失败测试**

`src/ui/RunDetailScreen.test.tsx`：

**(a)** `beforeEach` 的 `listRunEventsMock` 对象形状**已在 T1 契约同步中改好**（`{ events: [...], total: 1, historyAvailable: true }`）——本任务跳过，直接确认现有形状即可。

**(b)** 追加四条用例：

```tsx
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
    expect(screen.getByText('timeout')).toBeInTheDocument();
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
```

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/ui/RunDetailScreen.test.tsx`
Expected: FAIL（事件区仍是旧数组渲染；`data?.events` undefined → 空）。

- [ ] **Step 3: 实现**

`src/ui/RunDetailScreen.tsx`：

import 增加 gen 类型：

```tsx
import type { RunEvent, RunEventKind } from '../api/gen/agentcompose/v2/agentcompose_pb';
```

事件相关状态（`logs` 声明之后）：

```tsx
  const [extraEvents, setExtraEvents] = useState<RunEvent[]>([]);
  const [noMore, setNoMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | RunEventKind>('all');
```

`eventsQuery` 替换（分页 + 累积）：

```tsx
  const eventsQuery = useQuery({
    queryKey: ['run-events', runId],
    queryFn: () => listRunEvents(s, runId, { limit: 20 }),
    enabled: Boolean(runId),
  });

  // runId 切换时清掉累积的更多分页与错误态
  useEffect(() => {
    setExtraEvents([]);
    setNoMore(false);
    setLoadMoreError(false);
  }, [runId]);

  const events = [...(eventsQuery.data?.events ?? []), ...extraEvents];
  const canLoadMore = Boolean(eventsQuery.data) && (eventsQuery.data?.historyAvailable ?? false) && (eventsQuery.data?.total ?? 0) > events.length && !noMore;

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const res = await listRunEvents(s, runId, { limit: 20, offset: events.length });
      setExtraEvents((prev) => [...prev, ...res.events]);
      if (res.events.length === 0 || !res.historyAvailable || events.length + res.events.length >= res.total) {
        setNoMore(true);
      }
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleEvents = kindFilter === 'all' ? events : events.filter((ev) => ev.kind === kindFilter);
```

事件渲染区块整体替换：

```tsx
      <div className="run-section">
        <div className="run-section__head"><h3>事件时间线</h3></div>
        {events.length === 0 ? (
          <p className="run-section__empty">暂无事件。</p>
        ) : (
          <>
            <div className="run-events__toolbar">
              <label>
                类型
                <select aria-label="事件类型筛选" value={kindFilter} onChange={(e) => setKindFilter(e.target.value === 'all' ? 'all' : (Number(e.target.value) as RunEventKind))}>
                  <option value="all">全部</option>
                  <option value={RunEventKind.USER_MESSAGE}>你的消息</option>
                  <option value={RunEventKind.AGENT_MESSAGE}>助手消息</option>
                  <option value={RunEventKind.AGENT_ACTIVITY}>助手活动</option>
                  <option value={RunEventKind.STATUS}>状态变化</option>
                </select>
              </label>
            </div>
            <div className="run-events">
              {visibleEvents.map((ev) => (
                <div key={ev.id} className="run-event">
                  <span className="run-event__kind">{describeRunEventKind(ev.kind)}</span>
                  {ev.createdAt && <span className="run-event__time">{formatTime(timestampDate(ev.createdAt))}</span>}
                  {ev.text && <span className="run-event__text">{ev.text}</span>}
                  {!ev.success && (
                    <span className="run-event__fail">
                      {ev.exitCode !== 0 ? `退出码 ${ev.exitCode}` : ''}
                      {ev.exitCode !== 0 && ev.stopReason ? ' · ' : ''}
                      {ev.stopReason || ''}
                    </span>
                  )}
                  {ev.payloadJson && (
                    <details className="run-event__payload">
                      <summary>载荷</summary>
                      <pre>{ev.payloadJson}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
            {canLoadMore && (
              <button type="button" className="setup-btn setup-btn--ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? '加载中…' : '加载更多'}
              </button>
            )}
            {loadMoreError && <p className="run-section__empty" role="alert">加载更多失败，请重试。</p>}
          </>
        )}
      </div>
```
> `timestampDate` 已 import（组件现有）。`describeRunEventKind`/`formatTime` 已 import。

`src/ui/console.css` 末尾追加：

```css
.run-events__toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.run-events__toolbar select { padding: 4px 8px; border: 1px solid var(--ac-border, #d5d5d5); border-radius: 6px; font-size: 13px; background: #fff; }
.run-event__fail { color: #b91c1c; flex: 0 0 auto; }
.run-event__payload { flex: 0 0 auto; }
.run-event__payload pre { background: #f6f8fa; border: 1px solid var(--ac-border, #d5d5d5); border-radius: 6px; padding: 8px; font-size: 12px; overflow: auto; max-width: 320px; white-space: pre-wrap; word-break: break-word; }
```

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/ui/RunDetailScreen.test.tsx`
Expected: PASS。全量 `npx vitest run --testTimeout=30000` 无回归。

- [ ] **Step 5: 门禁 + 提交**

```bash
npm run build && npm run lint
git add src/ui/RunDetailScreen.tsx src/ui/RunDetailScreen.test.tsx src/ui/console.css
git commit -m "feat: 运行详情事件时间线增强（筛选/分页/失败详情/载荷展开）"
```

---

### Task 6: 运行列表——行内停止 / 再次运行 / 自动刷新

**Files:**
- Modify: `src/ui/RunsScreen.tsx`
- Modify: `src/ui/RunsScreen.test.tsx`
- Modify: `src/ui/console.css`（追加 `.runs-actions`，若 T3 已加则本任务无 CSS 改动——见 Step 3 注）

**Interfaces:**
- Consumes: `retryRun`（T1）、`stopRun`（runs.ts 既有）、`isRunTerminal`/`shouldAutoRefreshRuns`（T2，`../domain/runView`）、`runToRow`/`runStatusTone`（既有）。
- Produces: RunsScreen 列「运行 ID / 操作」+ 行内停止（确认弹层）+ 终态行再次运行 + 非终态 5s 自动刷新。

- [ ] **Step 1: 改/写失败测试**

`src/ui/RunsScreen.test.tsx`：

**(a)** mock 工厂加 `stopRun`/`retryRun`：

```tsx
const stopRunMock = vi.fn();
const retryRunMock = vi.fn();
vi.mock('../api/runs', () => ({
  listRuns: (...a: unknown[]) => listRunsMock(...a),
  stopRun: (...a: unknown[]) => stopRunMock(...a),
  retryRun: (...a: unknown[]) => retryRunMock(...a),
}));
```

**(b)** `beforeEach` 加：

```tsx
    stopRunMock.mockReset().mockResolvedValue(undefined);
    retryRunMock.mockReset().mockResolvedValue(summary());
```

**(c)** 追加四条用例：

```tsx
  it('运行 ID 列渲染 #shortId', async () => {
    listRunsMock.mockResolvedValue([summary({ runShortId: 'abc123' })]);
    renderScreen();
    await waitFor(() => expect(screen.getByText('#abc123')).toBeInTheDocument());
  });

  it('运行中行显示停止；确认后调 stopRun 并关闭弹层', async () => {
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '停止' }));
    await user.click(screen.getByRole('button', { name: '确认停止' }));
    await waitFor(() => expect(stopRunMock).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, 'r1', expect.stringContaining('stop')));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('停止前不调 stopRun（危险操作先确认）', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument());
    expect(stopRunMock).not.toHaveBeenCalled();
  });

  it('终态行显示再次运行；点击调 retryRun 并跳转新 run', async () => {
    listRunsMock.mockResolvedValue([summary({ runId: 'r9', status: RunStatus.SUCCEEDED })]);
    retryRunMock.mockReset().mockResolvedValue({ ...summary({ runId: 'r9', status: RunStatus.SUCCEEDED }), runId: 'r10', runShortId: 'r10' });
    const user = userEvent.setup();
    renderScreen();
    await waitFor(() => expect(screen.getByRole('button', { name: '再次运行' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '再次运行' }));
    await waitFor(() => expect(retryRunMock).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, 'r9'));
    await waitFor(() => expect(screen.getByText('run detail')).toBeInTheDocument());
  });
```
> 既有「点行跳运行详情」用例点 `agentName` 文本仍触发行级导航（按钮 `stopPropagation` 只在按钮上）。既有「表格渲染各列」断言不受新列影响。

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/ui/RunsScreen.test.tsx`
Expected: FAIL（无「运行 ID / 停止 / 再次运行」）。

- [ ] **Step 3: 实现**

`src/ui/RunsScreen.tsx` 整体替换为：

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadConnectionSettings } from '../api/connection';
import { listRuns, retryRun, stopRun } from '../api/runs';
import { isRunTerminal, runStatusTone, runToRow, shouldAutoRefreshRuns } from '../domain/runView';
import './console.css';

export function RunsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const s = loadConnectionSettings();
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['runs'],
    queryFn: () => listRuns(s, { limit: 50 }),
    refetchInterval: (q) => (shouldAutoRefreshRuns(q.state.data ?? []) ? 5000 : false),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['runs'] });

  const stopMutation = useMutation({
    mutationFn: async (runId: string) => {
      await stopRun(s, runId, 'user clicked stop');
    },
    onSuccess: () => {
      setStoppingId(null);
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (runId: string) => retryRun(s, runId),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
      navigate(`/console/runs/${run.runId}`);
    },
  });

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
  const stoppingRow = rows.find((r) => r.runId === stoppingId);

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
              <th>运行 ID</th>
              <th>来源</th>
              <th>状态</th>
              <th>耗时</th>
              <th>开始时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} onClick={() => navigate(`/console/runs/${r.runId}`)}>
                <td>{r.agentName}</td>
                <td>#{r.runShortId}</td>
                <td>{r.sourceLabel}</td>
                <td>
                  <span className={`run-status run-status--${runStatusTone(r.status)}`}>{r.statusLabel}</span>
                </td>
                <td>{r.durationText}</td>
                <td>{r.startedText}</td>
                <td>
                  {!r.terminal ? (
                    <button type="button" className="setup-btn setup-btn--ghost" onClick={(e) => { e.stopPropagation(); setStoppingId(r.runId); }}>停止</button>
                  ) : (
                    <button type="button" className="setup-btn setup-btn--ghost" onClick={(e) => { e.stopPropagation(); retryMutation.mutate(r.runId); }} disabled={retryMutation.isPending}>再次运行</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {stoppingRow && (
        <div className="auth-overlay" role="dialog" aria-label="停止确认">
          <div>
            <h3>停止这次运行？</h3>
            <p>正在进行的任务会立刻中断，已写入的结果不会保留。</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={stopMutation.isPending} onClick={() => stopMutation.mutate(stoppingRow.runId)}>
                {stopMutation.isPending ? '停止中…' : '确认停止'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setStoppingId(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
```
> `refetchInterval` 只在有非终态 run 时 5s 轮询；`shouldAutoRefreshRuns` 纯函数已在 T2 单测，此处一行接线由 reviewer 目验，不做 fake-timer 组件测试（jsdom + react-query 定时器易 flake）。`.runs-actions` 已在 T3 追加；若 T3 未执行到，本任务先补上该 CSS 块（同 T3 Step 3）。

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/ui/RunsScreen.test.tsx`
Expected: PASS。全量 `npx vitest run --testTimeout=30000` 无回归。

- [ ] **Step 5: 门禁 + 提交**

```bash
npm run build && npm run lint
git add src/ui/RunsScreen.tsx src/ui/RunsScreen.test.tsx src/ui/console.css
git commit -m "feat: 运行列表行内停止/再次运行 + 自动刷新"
```

---

## Self-Review

**1. Spec 覆盖：**
- §1 手动触发+重试 → T1（retryRun）+ T3（详情重试按钮）+ T6（列表再次运行）。✅
- §2 日志增强（includeMetadata + LogLine.at + HH:MM:SS + 复制）→ T1（透传）+ T2（runLog + formatClockTime）+ T4。✅
- §3 事件时间线增强（返回对象 + 筛选 + 加载更多 + 失败详情 + payload）→ T1（listRunEvents）+ T5。✅
- §4 运行列表增强（运行 ID 列 + 行内停止二次确认 + 再次运行 + 5s 自动刷新）→ T2（shouldAutoRefreshRuns）+ T6。✅
- §5 API/domain 汇总全落地；`useRunLogs.ts` 无需改动（options 已透传，计划 T2 已注明）。✅
- 危险操作（停止）二次确认 → T6 弹层 + 「停止前不调 stopRun」用例。✅
- 测试策略（wrapper 形状 mock、契约测试、中文、门禁）逐任务内置。✅

**2. Placeholder scan：** 无 TBD/TODO。每个 Step 含完整可执行代码与断言（测试、组件、CSS 全文给出）。`retryRun` 返回 `RunSummary`（T3/T6 mock 用 `summary()` 形状）；`listRunEvents` 新返回对象（T5 beforeEach/各用例形状一致）；`followRunLogs` 默认 `includeMetadata:false` 保持既有 runs.test 两条断言原样。

**3. Type consistency：**
- `retryRun(s, runId)` → T3 `retryRun(s, runId)`、T6 `retryRun(s, r.runId)`，返回 `.runId` 一致。✅
- `listRunEvents` → T5 `listRunEvents(s, runId, { limit: 20 })` / `{ limit: 20, offset: events.length }`，消费 `data.events/total/historyAvailable` 与 `res.events/historyAvailable/total` 一致。✅
- `FollowRunLogsOptions.includeMetadata` → T4 `useRunLogs(s, runId || null, { tailLines: 200, follow: true, includeMetadata: true })`；useRunLogs 透传 options（T2 注明无需改）。✅
- `LogLine.at?: Date` + `formatClockTime` → T4 渲染 `l.at && formatClockTime(l.at)`。✅
- `shouldAutoRefreshRuns(runs: Pick<RunSummary,'status'>[])` → T6 `q.state.data ?? []`（`RunSummary[]`）兼容。✅
- CSS 类：`.runs-actions`（T3 定义、T4/T6 复用）、`.run-log-*`（T4）、`.run-events__toolbar`/`.run-event__fail`/`.run-event__payload`（T5）均首次定义在本计划内，无悬空引用。✅
- 组件命名/query key：`['run', runId]`（既有，不动）、`['run-events', runId]`（T5 保持 runId 键控，runId 切换即新 query + extraEvents 重置 effect）、`['runs']`（T3/T6 invalidate）。✅

**4. 依赖顺序：** T1（API）→ T2（domain）→ T3/T4/T5（RunDetailScreen 三块，同文件顺序推进，各只依赖 T1/T2）→ T6（RunsScreen，依赖 T1/T2）。每任务 BASE = 前一 commit。✅
