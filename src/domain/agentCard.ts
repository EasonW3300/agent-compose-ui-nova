import { timestampDate } from '@bufbuild/protobuf/wkt';
import { RunStatus, type Project, type ProjectAgent } from '../api/gen/agentcompose/v2/agentcompose_pb';

export type AgentCardStatus = 'working' | 'paused' | 'errored' | 'idle';

/** 状态推导优先级：运行中 > 已暂停 > 出错 > 待命中。 */
export function agentCardStatus(agent: ProjectAgent): AgentCardStatus {
  if (agent.currentRun && agent.currentRun.runningRunCount > 0) return 'working';
  if (!agent.enabled) return 'paused';
  if (agent.latestRun && agent.latestRun.status === RunStatus.FAILED) return 'errored';
  return 'idle';
}

const AGENT_CARD_STATUS_LABELS: Record<AgentCardStatus, string> = {
  working: '正在工作',
  paused: '已暂停',
  errored: '出了点问题',
  idle: '待命中',
};

export function describeAgentCardStatus(s: AgentCardStatus): string {
  return AGENT_CARD_STATUS_LABELS[s];
}

/** gen RunStatus → 人话（buf 枚举成员是短形式：RunStatus.FAILED，无 SKIPPED）。 */
export function runStatusLabel(status: RunStatus): string {
  switch (status) {
    case RunStatus.RUNNING: return '正在工作';
    case RunStatus.WAITING_FOR_INPUT: return '等待你的回复';
    case RunStatus.SUCCEEDED: return '已完成';
    case RunStatus.FAILED: return '出了点问题';
    case RunStatus.CANCELED: return '已停止';
    case RunStatus.PENDING: return '排队中';
    default: return '未知';
  }
}

export interface AgentCard {
  key: string;
  projectId: string;
  agentName: string;
  projectName: string;
  displayName: string;
  provider: string;
  status: AgentCardStatus;
  schedulerEnabled: boolean;
  /** 暂停/启用的真值来源：翻的是 spec.agents[i].enabled（调度开关是另一回事）。 */
  enabled: boolean;
  /** 任务说明（读自 spec 的 trigger.prompt，列表页「立即运行」原样带上）。 */
  prompt: string;
  nextFireAt: Date | null;
  latestRun: { runId: string; statusLabel: string; at: Date | null } | null;
}

/** Project → 每 agent 一张卡片；nextFireFor 由数据层注入（Task 7 经 GetScheduler 解析）。 */
export function projectToCards(
  project: Project,
  nextFireFor: (a: ProjectAgent) => Date | null,
): AgentCard[] {
  const projectId = project.summary?.projectId ?? '';
  const projectName = project.summary?.name ?? project.spec?.name ?? '';
  return project.agents.map((a) => ({
    key: `${projectId}:${a.agentName}`,
    projectId,
    agentName: a.agentName,
    projectName,
    displayName: a.displayName || a.agentName,
    provider: a.provider,
    status: agentCardStatus(a),
    schedulerEnabled: a.schedulerEnabled,
    enabled: a.enabled,
    prompt:
      project.spec?.agents.find((s) => s.name === a.agentName)?.scheduler?.triggers[0]?.prompt ?? '',
    nextFireAt: nextFireFor(a),
    latestRun: a.latestRun
      ? { runId: a.latestRun.runId, statusLabel: runStatusLabel(a.latestRun.status), at: a.latestRun.at ? timestampDate(a.latestRun.at) : null }
      : null,
  }));
}
