# 上游 proto 来源

- 仓库: https://github.com/EasonW3300/agent-compose.git
- 锚定 commit: b44e2be（浅克隆 HEAD）
- 复制命令:
  cp /tmp/agent-compose/proto/agentcompose/v2/agentcompose.proto proto/agentcompose/v2/
  cp /tmp/agent-compose/proto/health/v1/health.proto proto/health/v1/
- 更新流程: 在上游新 commit 上重新复制 → npx buf generate → 修复 TS 编译错误 → 更新本文件 hash。
