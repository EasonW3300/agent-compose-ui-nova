# 可持续 Agent 对话与等待人工输入设计

## 背景

当前控制台的“测试运行一次”调用一元 RPC `StartAgentRun`，随后跳转至运行详情页。详情页只订阅日志与事件，不能向原运行发送消息。该模型适合一次性命令，但不适合 Claude Code 等会在任务过程中提问的 Agent。

协议中已有 `AttachAgentRun` 和 `human_message` 帧，但浏览器使用的 Connect Web transport 只支持一元与服务端流；它不能作为浏览器端的持久双向传输。同时，现有 attach 连接断开会结束运行。因此不能把浏览器连接当作 Agent 会话的所有者。

另一个独立问题是工作材料：隔离区默认 `/workspace` 为空。除非用户在“工作材料”中上传或挂载日志，Agent 无法读取用户主机上的工作日志。这一设计不会授予 Agent 对主机文件的隐式访问权限。

## 目标与非目标

目标：

- Agent 提问后，运行进入“等待你的回复”，而不是被标记为完成。
- 用户刷新、关闭或重新打开前端后，能继续同一运行、同一 sandbox 和同一 Agent 会话。
- 定时触发不会为同一 Agent 重复创建等待中的会话。
- 用户回复后，Agent 在原隔离区继续工作；日志和对话事件可审计。
- 正常完成、失败、停止、超时都与“等待输入”有清晰的状态语义。

非目标：

- 不以提问中的问号、自然语言措辞等启发式方式判断 Agent 是否完成。
- 不把浏览器 WebSocket 连接当作运行的唯一宿主。
- 不自动暴露用户主机上的文件或目录。
- 首期不保证 daemon 重启后恢复仍在内存中的 CLI 进程；此类运行应明确标记为中断，而不能伪装为可恢复。

## 方案选择

采用“后端托管的可恢复会话”。daemon 持有 runtime interaction、sandbox、Agent 进程和会话句柄；前端使用短请求发送消息，并通过既有日志/事件流读取进展。

不采用浏览器直连双向流：页面刷新或网络抖动会取消会话。也不采用“回复时新建运行”：这会丢失隔离区状态、原 Agent 上下文和多 Agent 编排关系。

## 状态机

在现有运行状态中增加非终态 `WAITING_FOR_INPUT`，并新增可辨识的终态 `INTERRUPTED`。所有状态均写入 run summary 和事件流。

| 当前状态 | 事件 | 下一状态 | 行为 |
|---|---|---|---|
| `RUNNING` | Agent 发送明确的 `needs_input` 控制事件 | `WAITING_FOR_INPUT` | 保留 runtime、sandbox、会话与日志；发布状态事件 |
| `WAITING_FOR_INPUT` | 用户发送回复 | `RUNNING` | 写入用户消息事件，向同一 runtime interaction 转发消息 |
| `RUNNING` | Agent 发送明确的 `completed` 控制事件 | `SUCCEEDED` | 写入最终结果，关闭 interaction，按策略清理 sandbox |
| `RUNNING` / `WAITING_FOR_INPUT` | 用户停止 | `CANCELED`（界面显示“已停止”） | 取消 interaction 并清理资源 |
| `RUNNING` / `WAITING_FOR_INPUT` | 等待期限到期 | `TIMED_OUT` | 写入超时原因，停止 interaction 并清理资源 |
| `RUNNING` / `WAITING_FOR_INPUT` | daemon 重启或不可恢复的 runtime 中断 | `INTERRUPTED` | 写入可读原因；不声称会话可恢复 |
| 任意非终态 | runtime/provider 错误 | `FAILED` | 记录错误并执行清理 |

`agent_turn_completed` 只表示一轮回答已结束，不能表示业务任务完成。runtime 必须输出版本化的结构化控制事件（至少含 `needs_input` 或 `completed`）。没有该事件时运行保持 `RUNNING`，由现有超时与用户停止机制兜底；禁止用文本猜测状态。

首期默认等待期限为 24 小时，作为 daemon 配置项提供。后续可增加项目级覆盖；到期前保留所需 sandbox 资源。

## 后端设计

### 会话所有权

新增 daemon 内的 `ConversationManager`，以 `run_id` 为键保存活动会话：sandbox ID、runtime interaction、Agent thread ID、输入队列、超时计时器及取消函数。它由 `RunSupervisor` 管理，而非由 HTTP 客户端连接管理。

会话启动后，manager 运行 `agent-compose-runtime stream` 并持续投影输出。浏览器断开只停止前端订阅，绝不向 manager 发送 EOF 或 cancel。manager 收到用户消息、Agent 控制事件、超时或停止命令后完成相应状态迁移。

daemon 重启时，内存中的 interaction 不能安全复用。启动恢复逻辑应找出活动 run，写入 `INTERRUPTED` 与原因；不得保留“等待回复”这一虚假状态。

### RPC

为浏览器使用新增一元操作；命名可在 proto 评审中最终确定：

```text
RunService.StartInteractiveAgentRun(StartAgentRunRequest) -> StartAgentRunResponse
RunService.SendRunHumanMessage(SendRunHumanMessageRequest) -> SendRunHumanMessageResponse
```

`SendRunHumanMessageRequest` 包含 `run_id`、非空 `text` 和客户端生成的 `client_message_id`。后端按 `(run_id, client_message_id)` 去重，使断网重试不会向 Agent 发送两次消息。只有 `WAITING_FOR_INPUT` 的 run 可接受消息；其它状态返回明确的 failed-precondition 错误。

原 `StartAgentRun` 保持为一次性、非交互 API，避免破坏 CLI 与现有调用方。`GetRun`、`ListRuns`、`ListRunEvents` 和 `FollowRunLogs` 复用，新增状态与用户/Agent 对话事件的投影。

### 调度与编排

调度器在一次触发前检查同一 `(project_id, agent_name)` 是否已有 `RUNNING` 或 `WAITING_FOR_INPUT` 的交互运行：

- 存在时跳过本次触发，不创建第二个 sandbox；写入 `scheduler.skipped_active_conversation` 事件。
- 用户回复后，原 run 继续；后续定时触发仍按正常计划执行。
- 原 run 进入任意终态后，下一次计划触发可创建新 run。

多 Agent 工作流通过 run 事件订阅 `SUCCEEDED`、`FAILED`、`WAITING_FOR_INPUT`，而不是依赖 CLI 文本。等待人工输入会阻塞仅依赖该 run 成功的后续节点，并在编排视图中显示阻塞原因。

### 工作材料与隔离

工作材料必须显式投影到 sandbox，例如上传后放入 `/workspace/materials`，或经用户确认的只读挂载映射到 `/workspace/<名称>`。创建向导应展示可读取路径，并把这些路径附加到运行上下文。没有材料时，UI 要明确提示“隔离区默认为空”，而不是暗示 Agent 可扫描本机文件。

## 前端设计

### 创建与启动

“测试运行一次”使用 `StartInteractiveAgentRun`，创建完成后跳转至运行详情。普通“保存”不启动运行。已有的“重新运行一次”保留为一次性重试，或在后续产品决定后明确标为“开始新的交互会话”。

### 运行详情

- 以“对话记录”展示 `USER_MESSAGE`、`AGENT_MESSAGE`、活动和状态事件；日志仍可作为诊断区域保留。
- `WAITING_FOR_INPUT` 时展示多行回复框、发送按钮和“结束任务”按钮。
- 发送期间禁用重复提交；成功后立即显示本地用户消息、状态切回“正在工作”，并刷新事件与日志。
- `RUNNING` 显示正在处理和停止按钮；终态不显示回复框。
- 页面加载时只依赖 `GetRun` 与事件列表恢复 UI，不依赖之前的浏览器连接。

### 列表与提醒

助手列表、运行列表和仪表盘新增“等待你的回复”徽标及待处理计数；点击直接进入对应运行详情。定时任务因等待会话被跳过时，界面展示最近一次跳过原因。

## 安全与资源策略

- 所有发送消息与读取运行接口沿用 daemon 鉴权；run 必须归属当前可访问项目。
- 人工消息写入审计事件，但敏感字段按现有日志/脱敏策略处理。
- sandbox 仅在等待窗口内保留；停止、超时、失败、完成和中断均执行清理策略。
- 回复 API 必须限制大小、校验空白输入并保证幂等。

## 测试与验收

后端：

1. Agent 发出 `needs_input` 后，run 变为 `WAITING_FOR_INPUT`，sandbox 未被清理。
2. HTTP/前端订阅断开后，会话不被取消；重新读取同一 run 可见等待状态和历史。
3. 合法回复只发送一次且状态回到 `RUNNING`；非等待状态回复被拒绝。
4. `completed`、停止、超时、provider 错误和 daemon 重启分别进入正确终态并清理资源。
5. 定时触发遇到活跃等待会话时跳过且不创建第二个 run。
6. proto 兼容与存储迁移测试覆盖旧 run 的读取和新枚举值。

前端：

1. 测试运行使用交互启动 API 并跳转详情。
2. 等待状态展示回复框；运行和终态不展示错误的可回复控件。
3. 发送回复调用带幂等 ID 的 API，乐观显示用户消息并刷新状态。
4. 刷新/重新进入详情后仍展示同一会话和待回复控件。
5. 运行、助手和仪表盘正确显示等待徽标与跳过原因。
6. 工作材料缺失时有明确空隔离区提示；材料路径可见。

端到端：使用受控 fake runtime 依次发出 `needs_input`、人工回复、`completed`，验证浏览器刷新与调度跳过。

## 交付顺序

1. 在 agent-compose daemon 中实现状态、存储迁移、会话 manager、runtime 控制帧和 RPC。
2. 生成并同步前端 proto 客户端。
3. 实现前端运行详情回复体验、列表/仪表盘状态与工作材料提示。
4. 完成 daemon、前端及端到端验证，再分别提交各自仓库。
