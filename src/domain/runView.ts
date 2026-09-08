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

export type RunStatusTone = 'running' | 'waiting' | 'succeeded' | 'failed' | 'stopped' | 'idle';

export function runStatusTone(status: RunStatus): RunStatusTone {
  switch (status) {
    case RunStatus.RUNNING: return 'running';
    case RunStatus.WAITING_FOR_INPUT: return 'waiting';
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

/** 日志行时间戳：HH:MM:SS（本地时区）。 */
export function formatClockTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 运行列表是否值得自动刷新：存在任一非终态 run。 */
export function shouldAutoRefreshRuns(runs: Pick<RunSummary, 'status'>[]): boolean {
  return runs.some((r) => !isRunTerminal(r.status));
}
