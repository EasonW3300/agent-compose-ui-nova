import { createClient } from '@connectrpc/connect';
import { createDaemonTransport, type ConnectionSettings } from './connection';
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

export async function listRunEvents(
  s: ConnectionSettings,
  runId: string,
  opts: { limit?: number } = {},
): Promise<RunEvent[]> {
  const res = await runClient(s).listRunEvents({ runId, limit: opts.limit ?? 200, offset: 0 });
  return res.events;
}

export interface FollowRunLogsOptions {
  tailLines?: number;
  follow?: boolean;
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
      includeMetadata: false,
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
