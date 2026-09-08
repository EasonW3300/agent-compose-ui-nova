import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';
import { RunEventKind, RunSource, RunStatus, RunSummarySchema } from '../api/gen/agentcompose/v2/agentcompose_pb';
import {
  describeRunEventKind,
  describeRunSource,
  formatClockTime,
  formatDuration,
  formatTime,
  isRunTerminal,
  runStatusTone,
  runToRow,
  shouldAutoRefreshRuns,
} from './runView';
import { runStatusLabel } from './agentCard';

function summary(over: MessageInitShape<typeof RunSummarySchema> = {}): Parameters<typeof runToRow>[0] {
  return create(RunSummarySchema, {
    runId: 'r1', projectId: 'p1', projectName: 'proj', projectRevision: 0n, agentId: 'ag',
    agentName: 'my-report', source: RunSource.MANUAL, schedulerId: '', triggerId: '',
    status: RunStatus.RUNNING, exitCode: 0, error: '', durationMs: 0n, warnings: [],
    sandboxId: '', runShortId: 'abc12345', sandboxShortId: '', schedulerRunId: '', ...over,
  });
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

  it('等待输入运行显示为等待你的回复，且仍是非终态', () => {
    expect(runStatusLabel(RunStatus.WAITING_FOR_INPUT)).toBe('等待你的回复');
    expect(runStatusTone(RunStatus.WAITING_FOR_INPUT)).toBe('waiting');
    expect(isRunTerminal(RunStatus.WAITING_FOR_INPUT)).toBe(false);
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

  it('formatClockTime 输出 HH:MM:SS（本地时区）', () => {
    expect(formatClockTime(new Date(2026, 7, 27, 14, 5, 9))).toBe('14:05:09');
  });

  it('shouldAutoRefreshRuns：有非终态即 true，全终态 false', () => {
    expect(shouldAutoRefreshRuns([{ status: RunStatus.RUNNING }])).toBe(true);
    expect(shouldAutoRefreshRuns([{ status: RunStatus.SUCCEEDED }, { status: RunStatus.PENDING }])).toBe(true);
    expect(shouldAutoRefreshRuns([{ status: RunStatus.SUCCEEDED }, { status: RunStatus.FAILED }])).toBe(false);
    expect(shouldAutoRefreshRuns([])).toBe(false);
  });
});
