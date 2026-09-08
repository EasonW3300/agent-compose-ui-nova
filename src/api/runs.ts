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

/** 将用户回复追加到等待输入的互动运行；clientMessageId 由调用者生成以支持安全重试。 */
export async function sendRunHumanMessage(
  s: ConnectionSettings,
  runId: string,
  text: string,
  clientMessageId: string,
): Promise<RunSummary> {
  // The daemon deduplicates by this caller-owned ID, so retries must preserve it
  // instead of generating a new ID inside the transport wrapper.
  const res = await runClient(s).sendRunHumanMessage({ runId, text, clientMessageId });
  if (!res.run) throw new Error('sendRunHumanMessage 未返回 run');
  return res.run;
}

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

/** 用某次运行的项目/助手/原 prompt 重起一次新 run（fire-and-forget）。 */
export async function retryRun(s: ConnectionSettings, runId: string): Promise<RunSummary> {
  const detail = await getRun(s, runId);
  if (!detail?.summary) throw new Error('运行不存在，无法重试');
  return startAgentRun(s, { projectId: detail.summary.projectId, agentName: detail.summary.agentName, prompt: detail.prompt });
}

export interface FollowRunLogsOptions {
  tailLines?: number;
  follow?: boolean;
  includeMetadata?: boolean;
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
      includeMetadata: opts.includeMetadata ?? false,
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
