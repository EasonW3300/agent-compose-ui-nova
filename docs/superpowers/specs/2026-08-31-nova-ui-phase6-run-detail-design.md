# Phase 6 设计：运行详情增强

- 日期：2026-08-31
- 状态：已与需求方确认范围（brainstorming 一次决策，全选四子范围）
- 分支：`feat/phase6-run-detail` off `origin/main`（含 P1-P5 全部已合并）
- 上游主设计：`docs/superpowers/specs/2026-08-27-agent-compose-nova-ui-design.md`（本文件是其 §5.3 运行记录页的 Phase 6 增强落地设计）

## 0. 范围与决策记录

本阶段增强「运行」全链路：详情页（手动触发/重试、日志、事件时间线）+ 运行列表页。一次已确认决策：

| 决策点 | 结论 |
|---|---|
| 范围 | 全选：手动触发+重试、日志增强、事件时间线增强、运行列表增强 |
| `listRunEvents` 返回形状 | **改成对象** `{ events, total, historyAvailable }`（breaking，消费方仅 RunDetailScreen + 其测试 + `runs.test.ts` 契约测试三处同步改）——单一职责，分页/总数是增强根基 |
| 「手动触发」落点 | 只在 RunDetailScreen（重试=手动触发同 agent，复用原 prompt）；AgentListScreen 既有「立即运行」不变；RunsScreen 不做跨 agent 触发 |
| 日志元数据 | `followRunLogs` 加 `includeMetadata?: boolean`（**默认 false 向后兼容**），RunDetailScreen 显式开启 |
| 危险操作 | 仅新增的 RunsScreen 行内「停止」需二次确认（既有清单：删除/Prune/移除/停止）；「重新运行」不破坏任何东西，无需确认 |
| 自动刷新 | RunsScreen 有非终态 run 时 5s `refetchInterval`，全终态停 |

约束：文案全中文走 `labels.ts` TERMS（新增术语表项）；401 → 既有 AuthOverlay 登录浮层（新 mutation 走既有 global authInterceptor）；危险操作（停止）二次确认 + 人话后果；无新依赖（仅既有 @tanstack/react-query@^5）；永不修改 `src/api/gen/**`；strict build + lint 零警告。

## 1. 手动触发 + 重试（RunDetailScreen）

### 1.1 API 层

- `src/api/runs.ts` 新增 `retryRun(s, runId): Promise<RunSummary>`：
  - `getRun(s, runId)` 取 `summary.projectId` / `summary.agentName` / `detail.prompt`
  - 再 `startAgentRun(s, { projectId, agentName, prompt })`（fire-and-forget，复用既有 wrapper）
  - 逻辑集中在 API 层，可单测；UI 不感知取字段细节

### 1.2 UI

- RunDetailScreen 头部加「重新运行一次」按钮（running 态也能点，会另起新 run）
- 点击 → `retryRun` → invalidate `['runs']` → navigate `/console/runs/${newRunId}`（新 run 详情）
- 失败时按钮恢复 + 顶部 alert（人话）；无需二次确认

## 2. 日志增强（RunDetailScreen 日志区 + 数据链）

### 2.1 API 层

- `FollowRunLogsOptions` 加 `includeMetadata?: boolean`（默认 false），`followRunLogs` 透传给 gen `include_metadata`（当前硬编码 false）

### 2.2 Domain 层

- `src/domain/runLog.ts`：`LogLine` 加 `at?: Date`
- `appendLogChunk(buf, chunk)`：把 `chunk.createdAt`（`timestampDate`）写入该 chunk 产生的每行（同 chunk 共享时间戳）；无 `createdAt` 时行不设 `at`（兼容老数据）

### 2.3 Hook 层

- `src/hooks/useRunLogs.ts`：透传 `includeMetadata` option

### 2.4 UI

- RunDetailScreen 传 `includeMetadata: true`；日志行渲染 `HH:MM:SS` 时间戳前缀（`at` 存在时）
- 日志区头部加「复制日志」按钮：`navigator.clipboard.writeText(lines.map(l => l.text).join('\n'))`，成功后短暂「已复制」
- YAGNI：不做暂停跟随 / 搜索

## 3. 事件时间线增强（RunDetailScreen 事件区）

### 3.1 API 层（wrapper 契约变更）

- `listRunEvents` 改签名：接受 `{ limit?, offset? }`，返回 `{ events: RunEvent[]; total: number; historyAvailable: boolean }`
- 消费方仅 RunDetailScreen + 其测试 + `runs.test.ts` 契约测试，同步改（组件读 `eventsQuery.data?.events`；契约测试改断言返回对象）

### 3.2 UI

- 事件行 = kind 徽章 + 时间 + text + **失败详情** + **payload 可展开**：
  - 当 `!ev.success` 时：`exitCode !== 0` 则追加 `退出码 {exitCode}`；`stopReason` 非空则追加 `{stopReason}`
  - `<details>` 展开 `payloadJson`（空字符串则不渲染）
- **类型筛选**：select（全部 / 你的消息 / 助手消息 / 助手活动 / 状态变化），前端过滤 `ev.kind`
- **加载更多**：仅当 `historyAvailable && total > 已加载条数` 时渲染「加载更多」，点击 `offset += limit` 追加

## 4. 运行列表增强（RunsScreen）

- 表格列改为：AI 助手 / 运行 ID（`#runShortId`）/ 来源 / 状态 / 耗时 / 开始时间 / **操作**
- 操作列：
  - 非终态行（`!isRunTerminal`）：「停止」→ 二次确认弹层（复用 stopRun → invalidate `['runs']`）
  - 终态行：「再次运行」→ 复用 `retryRun`（invalidate + navigate 到新 run）
- **自动刷新**：`refetchInterval: (query) => query.state.data?.some(r => !isRunTerminal(r.status)) ? 5000 : false`
- `runToRow` 补 `runShortId` 展示（字段已有，仅加列）
- YAGNI：本轮不做分页/筛选

## 5. API / Domain / Hook 改动汇总

| 文件 | 改动 |
|---|---|
| `src/api/runs.ts` | +`retryRun`；`listRunEvents` 换返回形状 + offset；`followRunLogs` 透传 `includeMetadata` |
| `src/domain/runLog.ts` | `LogLine.at?`；`appendLogChunk` 写时间戳 |
| `src/hooks/useRunLogs.ts` | 透传 `includeMetadata` |
| `src/domain/runView.ts` | `runToRow` 补 `runShortId` 列字段（如有必要） |
| `src/ui/RunDetailScreen.tsx` | 重试按钮 + 日志时间戳/复制 + 事件筛选/加载更多/失败详情/payload 展开 |
| `src/ui/RunsScreen.tsx` | 新列 + 行内停止（确认弹层）+ 行内再次运行 + 自动刷新 |
| `src/ui/console.css` | 追加 `run-*` 增补类（时间戳、事件筛选、行内操作按钮、日志工具条） |

## 6. 任务拆解（初稿，writing-plans 细化）

1. T1 API 层：`retryRun` + `listRunEvents` 换形状 + `followRunLogs` includeMetadata 透传（wrapper + 契约测试）
2. T2 Domain + Hook：`runLog.ts` 时间戳 + `useRunLogs` 透传（runLog 单测）
3. T3 RunDetailScreen：重试按钮（retryRun 集成）
4. T4 RunDetailScreen：日志时间戳 + 复制按钮
5. T5 RunDetailScreen：事件筛选 + 加载更多 + 失败详情 + payload 展开
6. T6 RunsScreen：新列 + 行内停止（确认弹层）+ 再次运行 + 自动刷新

依赖序：T1 → T2 → T3/T4/T5（各自只依赖 T1/T2，可并行但按序推进）→ T6。每任务 BASE = 前一 commit。

## 7. 测试策略

- 每任务 TDD 红→绿；`npx vitest run <file>`（永不裸 `npx vitest`）；全量 `--testTimeout=30000`
- 组件测试 mock **wrapper 返回形状**（非 RPC 原始形状）：`listRunEvents` 的 `{ events, total, historyAvailable }`、`retryRun` 的 `RunSummary`、`useRunLogs` 的 `LogLine`（含 `at`）
- 危险操作流：RunsScreen 行内停止必须断言「确认前不调 stopRun、确认后才调」
- 契约测试：`retryRun` 字段来源、`listRunEvents` 分页 offset/total、`followRunLogs` includeMetadata 透传
- 门禁：`npm run build`（tsc -b && vite build）+ `npm run lint`（oxlint）全绿零警告

## 8. 非目标

- RunsScreen 分页/类型筛选（数据量级小，50 条内）
- 跨 agent 手动触发选择器（RunsScreen 顶栏触发任意 agent——需要 agent 选择器，体量大）
- 日志暂停跟随 / 搜索 / 下载
- 事件 payload 结构化解读（仅原样展开 JSON 文本）
- `runAgent`（阻塞等待终态）在 UI 使用——fire-and-forget `startAgentRun` 已够
