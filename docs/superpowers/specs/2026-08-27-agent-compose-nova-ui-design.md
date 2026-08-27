# Agent Compose Nova UI 设计文档

- 日期：2026-08-27
- 状态：已与需求方逐节确认
- 目标仓库：`work_pro/agent-compose-ui-nova`（全新独立仓库）
- 上游依赖：https://github.com/EasonW3300/agent-compose （下称 AC，daemon + CLI 控制面）

## 1. 背景与目标

AC（agent-compose）通过 `agent-compose.yml` 声明式地在隔离沙箱中运行 AI coding agent。其官方 Web UI 面向的是理解 YAML、Docker、cron 的技术用户。

本项目为其构建**一套全新的前端**：

1. **面向非技术人员**：用户不需要知道 agent-compose、YAML、Docker、cron 的存在。
2. **以 AC 功能引导为导向**：界面让用户直观了解 AC 能做什么，并引导其完成"安装 → 配置 → 创建 → 运行 → 观察"全流程。
3. **自助安装**：非技术用户全程自己在网页向导引导下完成 daemon 安装（复制粘贴一键脚本），不写代码。
4. **覆盖 AC 全部功能域**：项目/agent、调度、运行、资源（工作区/卷/镜像/沙箱/缓存）、MCP/skills/capset、设置、Dashboard。
5. **Provider 聚焦 4 个**：Claude Code（`claude`）、Codex（`codex`）、Pi（`pi`）、DSH（`dsh`）。gemini/opencode 不在界面中提供选项（协议层不禁止即可）。

### 成功标准

- 一个未接触过命令行的用户，跟随页面指引在本机完成安装并跑起第一个定时运行的 AI 助手。
- AC 的每个 API 功能域在界面上都有对应入口；高级能力（MCP、volume、env 等）全部可用但收纳于折叠区。
- 用户在任何一步出错时都能用人话得知发生了什么、下一步做什么。

## 2. 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 部署形态 | 网页向导 + 轻量脚本安装；不做桌面壳 |
| 访问路径 | 仅本机使用，前端与 daemon 同机 |
| 主交互 | 分步表单向导创建/编辑 agent |
| 高级功能 | 向导内折叠高级选项，单套界面 |
| 技术栈 | React + Vite + TypeScript |
| API 对接 | buf 从上游 proto 生成 TS 类型 + `@connectrpc/connect-web` |
| 代码位置 | 全新独立仓库 |

## 3. 总体架构

纯静态 React SPA，无自有后端、无数据库。所有持久状态在 daemon（ConnectRPC API），浏览器本地仅存登录凭据与界面偏好（localStorage）。

应用按 daemon 是否在线自动切换两个世界：

```
打开页面
   ├─ health 检查失败 → 装机向导世界（见 §4）
   └─ health 检查成功 → 主控台世界（见 §5）
```

daemon 地址默认 `http://127.0.0.1:7410`，可在界面修改（存 localStorage）。

## 4. 装机向导世界（无 daemon 时）

顶部单屏线性流程，共 5 屏：

1. **欢迎与图解**：一屏漫画式说明——AC 是什么、"AI 助手 = 你描述任务，它到隔离沙箱里替你干"。
2. **环境自检与安装引导**：检测操作系统；给出对应的一键安装脚本（Linux：官方 install.sh；macOS：引导装 Docker Desktop 后运行脚本）；用户复制到终端执行；页面轮询 health 端点探测就绪。
3. **首次登录**：粘贴安装器打印的 admin 密码。
4. **Provider 密钥配置**：claude / codex / pi / dsh 四节，图形化填 key（可跳过，留到设置页）。
5. **完成页**：庆祝 + 进入主控台。

向导每步都可返回上一步；探测到 daemon 在线时任意时刻可跳过剩余步骤直接进入主控台。

## 5. 主控台世界

左侧导航，5 个一级页面：

### 5.1 首页 Dashboard
数据源 `GetDashboardOverview` / `WatchDashboardOverview`（流式）。四块内容：
- 运行中助手数
- 今日运行次数
- 最近失败告警（人话标题 + "查看日志"）
- 快捷入口（新建助手等）

### 5.2 我的 Agent
卡片网格（来自 `ListProjects` 展开 agents）。每卡：名称、引擎 logo、状态徽章（工作中/已暂停/出错）、下次运行时间、最近结果摘要。操作：立即运行、暂停/启用、编辑、查看日志、删除。不做批量操作。
「+ 新建」进入创建向导（§6）。

### 5.3 运行记录
全局 `ListRuns` 表格 + 详情页。详情核心为流式日志查看器（`StreamAgentRun` / `FollowRunLogs`），附运行事件时间线（`ListRunEvents`）与状态色条。可停止运行（`StopRun`）。

### 5.4 资源中心
四个 Tab，复用向导中的高级表单组件：
- 工作区 Presets（SettingsService ListWorkspacePresets 等）
- 数据卷（VolumeService CRUD + Prune）
- 插件库（MCP servers 与 skills 的管理视图）
- 沙箱与镜像（SandboxService / ImageService / CacheService：列表、停止、清理）
所有 Prune 类危险操作二次确认并以人话解释后果。

### 5.5 设置
- Provider 密钥管理（四引擎分节，掩码显示）
- 全局环境变量（GetGlobalEnv / UpdateGlobalEnv）
- Capability Gateway 配置（折叠，标"进阶"；CapabilityService）
- 调度总开关与调度历史入口（Scheduler 相关 RPC）

## 6. Agent 创建向导（核心交互）

一条 5 步线性向导，顶部分步条；编辑已有 agent 复用同一向导并回填草稿。

| 步骤 | 内容 | 映射字段 |
|---|---|---|
| 1 选 AI 引擎 | claude/codex/pi/dsh 四张卡片（logo+人话定位+适用场景）；模型型号从 capability catalog 选择或自由填写 | `provider`, `model` |
| 2 任务说明 | 大文本框（含点击即填示例）；折叠：角色设定(`system_prompt`)、环境变量键值对 | `system_prompt`, `env` |
| 3 触发方式 | 三选一可视化卡片：手动 / 定时（可视化日期时间选择器→cron）/ 固定间隔（数字+单位）；折叠：事件 webhook、超时时长 | `scheduler` |
| 4 工作材料 | 工作区三选：空/本地路径/Git 地址(+分支)；数据文件夹挂载列表（源→目标→只读）；折叠：MCP 插件添加器、技能包、Jupyter 开关 | `workspace`, `volumes`, `mcp_servers`, `skills`, `jupyter` |
| 5 确认创建 | 左侧人话摘要卡片；右侧可展开原始 YAML 预览；按钮：测试运行一次 / 保存 | 整体 `AgentSpec` |

内部维护结构化 `AgentDraft`（TS 类型对齐 `AgentSpec`）。保存流程：`ValidateProject` 校验 → 失败则定位回对应步骤做字段级红标 → 通过后 `ApplyProject`。测试运行走 `StartAgentRun` 并跳转运行详情。

## 7. 文案转译原则

| AC 术语 | 界面用语 |
|---|---|
| agent | AI 助手 |
| project | 助手团队（分组） |
| provider | AI 引擎 |
| scheduler (cron / interval / event) | 什么时候干活：定时 / 重复间隔 / 有事叫我 |
| volume | 数据文件夹 |
| workspace (git) | 工作材料（材料来源） |
| MCP server | 插件 |
| skill | 技能包 |
| sandbox | 助手的工作台（隔离环境，一般不需用户感知） |

## 8. 数据流与状态管理

- React Query 管 daemon 同步请求缓存与失效。
- 流式接口（WatchDashboardOverview、StreamAgentRun、FollowRunLogs、WatchSandbox 等）封装为独立订阅 hook：断线自动重连（指数退避），组件卸载即取消。
- 登录凭据存 localStorage；任何 401 统一弹回登录浮层。

## 9. API 客户端策略

- 将上游 `/tmp/agent-compose/proto` 下的 `.proto` 复制进本仓库 `proto/`（记录来源 commit）；
- `buf generate` 产出 TS 类型与 connect-web 客户端，生成物入 git 以简化 CI；
- 上游更新流程：重新复制 proto → 重新生成 → 修复编译错误；
- 手写胶水代码仅限连接层（base URL 管理、健康探测、认证头注入）。

## 10. 错误处理

三层：
1. **网络/daemon 不在线**：全局兜底页"连不上 agent-compose"，附装机向导入口。
2. **业务校验失败**：向导内定位步骤 + 字段级提示。
3. **运行期失败**（run 非零退出）：卡片人话告警 + 一键日志 + 日志底部"常见问题排查"链接。

## 11. 测试策略

- **单元测试（Vitest）**：cron 可视化选择器⇄表达式互转；`AgentDraft`⇄YAML 生成；术语映射与状态转译函数。
- **组件测试（Vitest + Testing Library）**：向导各步校验、高级折叠行为、列表危险操作确认流程。
- **契约 smoke 测试**：mock Connect handler 断言生成的客户端调用签名正确。
- **E2E（Playwright，后置可选）**："探测→登录→建一个手动触发的 codex 助手→看运行日志"主干路径。

## 12. 非目标（Non-goals）

- 不做多用户、权限体系（沿用 admin 单用户模型）。
- 不做移动端原生适配之外的响应式优化要求。
- 不支持 gemini / opencode 引擎的专用界面（API 兼容即可，不放选项）。
- 第一版不打包 Docker 镜像、不做远程主机部署指引。
