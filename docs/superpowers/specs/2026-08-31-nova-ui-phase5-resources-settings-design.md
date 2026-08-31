# Phase 5 设计：资源中心 + 设置

- 日期：2026-08-31
- 状态：已与需求方逐节确认（brainstorming 三轮决策）
- 分支：`feat/phase5-resources-settings` off `origin/main`（含 P1-P4 全部已合并）
- 上游主设计：`docs/superpowers/specs/2026-08-27-agent-compose-nova-ui-design.md`（本文件是其 §5.4/§5.5 的 Phase 5 落地设计）

## 0. 范围与决策记录

本阶段补齐主控台全部 5 个一级页面（§5.4 资源中心 + §5.5 设置）。三轮已确认决策：

| 决策点 | 结论 |
|---|---|
| 范围 | 都做（资源中心 + 设置） |
| 插件库 Tab | 技能包能力集视图 + 在用 MCP/技能汇总（**只读**）——proto 无全局 MCP server 管理 RPC |
| 设置页调度节 | 调度总览（跨项目）+ 调度事件历史（全局）——proto 无全局调度开关 RPC |
| Provider 密钥 | 复用既有 `ProviderKeysScreen`（`onNext` 改可选） |
| 流式订阅 | P5 资源页用 unary 列表 + 操作后 refetch；`WatchSandbox` 实时订阅延后（可选，不在本阶段） |
| 镜像操作 | 只做移除，不做 Pull（本阶段） |

约束：文案全中文走 `labels.ts` TERMS；401 → 既有 AuthOverlay 登录浮层；危险操作（删除/Prune/移除）一律二次确认 + 人话后果；无新依赖（仅既有 @tanstack/react-query@^5）；永不修改 `src/api/gen/**`。

## 1. 资源中心 `/console/resources`

单页 + 4 Tab（本地 useState 切换，默认「工作区 Presets」）。共用既有 `console.css` 前缀类（追加 `res-*` 前缀，无覆盖）。

### 1.1 工作区 Presets（SettingsService）

- 列表：`ListWorkspacePresets` → 卡片/表格（name、type、id）
- 新建/编辑：对话框（name + type；`configJson` 折叠为「进阶」文本域）
- 删除：二次确认
- RPC：`listWorkspacePresets` / `createWorkspacePreset` / `updateWorkspacePreset` / `deleteWorkspacePreset`
- 形状：`WorkspacePreset { id, name, type, configJson }`

### 1.2 数据卷（VolumeService）

- 列表：`ListVolumes` → 表格（name、driver、path）
- 新建：对话框（name + driver + path）
- 删除单个：二次确认
- Prune 未使用卷：二次确认 + 人话后果
- RPC：`listVolumes` / `createVolume` / `inspectVolume` / `removeVolume` / `pruneVolumes`
- 形状：`Volume { name, driver, path, labels }`

### 1.3 插件库（CapabilityService 只读 + 跨项目汇总）

- 技能包能力集：`ListCapabilitySets` 列表（enabled 徽章；展开某包时 `GetCapabilityCatalog` 显示方法列表；`GetCapabilityStatus` 状态点 configured/ok）
- 在用 MCP/技能汇总：复用 `ListProjects`（useAgents 同源）→ 展开 agent specs → 跨项目聚合 `mcp_servers` 与 `skills`，只读表格（所属项目/agent）
- RPC：`listCapabilitySets` / `getCapabilityCatalog` / `getCapabilityStatus`
- 形状：`CapabilitySet { id, name, description, enabled }`；`GetCapabilityCatalogResponse { capsetId, name, description, methods[] }`；`CapabilityStatusResponse { configured, ok }`

### 1.4 沙箱与镜像（SandboxService + ImageService + CacheService）

- 沙箱：`ListSandboxes` 列表（状态）→ 停止/恢复/移除（各二次确认）+ Prune（二次确认）
- 镜像：`ListImages` 列表（名称/大小/创建时间）→ 移除（二次确认）；不做 Pull
- 缓存：`ListCaches` 列表 → 移除（二次确认）+ Prune（二次确认）
- RPC：`listSandboxes` / `stopSandbox` / `resumeSandbox` / `removeSandbox` / `pruneSandboxes`；`listImages` / `removeImage`；`listCaches` / `removeCache` / `pruneCaches`

## 2. 设置 `/console/settings`

单页 4 节（纵向区块，复用 `console.css` 既有区块样式 + 追加 `set-*` 前缀类）。

### 2.1 Provider 密钥

复用 `src/ui/ProviderKeysScreen.tsx`：`onNext` 从必填改可选（console 下无「下一步」按钮，仅各引擎保存）。掩码显示 + 保存 + 校验反馈。数据走既有 `src/domain/providerKeys.ts` / `src/api/settings.ts`。

### 2.2 全局环境变量

- 读：`getGlobalEnv`（wrapper 已有）→ 键值行列表
- 写：`updateGlobalEnv`（wrapper 已有）→ 增删行 + 保存
- `EnvVarSpec { name, value, secret }`：secret 项掩码显示（编辑时留空 = 不更改）

### 2.3 Capability Gateway 配置

- 读：`getCapabilityGatewayConfig`；写：`updateCapabilityGatewayConfig`
- 折叠区块，标「进阶」；JSON 文本域编辑 + 保存 + 校验反馈

### 2.4 调度

- **总览**：复用 `ListProjects` → 跨项目聚合每个 agent 的调度状态（enabled + nextFireAt + provider），行点击跳转 `/console/agents/:agentName/edit`
- **事件历史**：`ListSchedulerEvents`（全局）→ 时间线（type/level/message/runId/时间）
- RPC：`listSchedulerEvents`；`ListSchedulerEventsRequest` 全局（无 project 必填）

## 3. API 层

- 新增 `src/api/resources.ts`：volumes / sandboxes / images / caches / capability / scheduler events 的 wrapper（一律 `createClient(Service, createDaemonTransport(s))` 模式，同 `src/api/runs.ts`/`settings.ts`）
- `src/api/settings.ts` 扩展：`getWorkspacePresets` / `createWorkspacePreset` / `updateWorkspacePreset` / `deleteWorkspacePreset`（Presets 属 SettingsService，与全局 env / Gateway 配置同文件；资源中心 Tab 1 消费）/ `getCapabilityGatewayConfig` / `updateCapabilityGatewayConfig`
- 复用既有：`ProviderKeysScreen`、`getGlobalEnv`/`updateGlobalEnv`、`ListProjects`（useAgents 同源）、AuthOverlay、labels.ts TERMS

## 4. Domain 层

- 新增 `src/domain/resourceView.ts`：资源人话转译（sandbox/image/cache 状态、preset type、scheduler event level/type）+ 危险操作后果文案
- `labels.ts` TERMS 增补：volume→数据卷（资源中心页签）/数据文件夹（向导内）、sandbox→助手工作台、image→镜像、cache→缓存、preset→预设、prune→清理

## 5. 任务拆解（初稿，writing-plans 细化）

1. T1 `src/api/resources.ts` + `settings.ts` 扩展（8 组 wrapper）
2. T2 `src/domain/resourceView.ts` + labels TERMS 增补
3. T3 资源中心：工作区 Presets + 数据卷
4. T4 资源中心：插件库
5. T5 资源中心：沙箱与镜像
6. T6 设置：Provider 密钥（复用改造）+ 全局 env
7. T7 设置：Capability Gateway + 调度（总览 + 事件历史）
8. T8 路由接线（`/console/resources`、`/console/settings` 占位 → 新页）+ 导航验证

## 6. 测试策略

- 每任务 TDD 红→绿；`npx vitest run <file>`（永不裸 `npx vitest`）；全量 `--testTimeout=30000`
- 组件测试：各 Tab 列表/对话框/二次确认流、设置各节保存流、secret 掩码
- 契约 smoke：mock Connect handler 断言 wrapper 调用签名（沿用 `src/api/gen.smoke.test.ts` 模式）
- 危险操作流：删除/Prune 必须断言「确认前不调 RPC、确认后才调」
- 门禁：`npm run build`（tsc -b && vite build）+ `npm run lint`（oxlint）全绿零警告

## 7. 非目标

- `WatchSandbox` 等资源实时订阅 hook（延后）
- 镜像 Pull / 构建（`pullImage`/`buildImage` 不在本阶段）
- MCP server 全局管理写入（daemon 无此 RPC）
- 全局调度开关（daemon 无此 RPC）
- 资源筛选/分页（数据量级小，本阶段列表全量拉取）
