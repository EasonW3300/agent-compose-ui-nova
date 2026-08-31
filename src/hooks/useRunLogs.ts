import { useCallback, useState } from 'react';
import { RunStatus, type RunLogChunk } from '../api/gen/agentcompose/v2/agentcompose_pb';
import type { ConnectionSettings } from '../api/connection';
import { followRunLogs, type FollowRunLogsOptions } from '../api/runs';
import { appendLogChunk, createLogBuffer, type LogBuffer, type LogLine } from '../domain/runLog';
import { useServerStream } from './useServerStream';

export interface RunLogsState {
  /** 已累积的日志行（跨重连累积，进程终止后不再增长）。 */
  lines: LogLine[];
  /** 日志流带出的最新运行状态；未知前为 null。 */
  status: RunStatus | null;
  connected: boolean;
  error: string | null;
  reset: () => void;
}

export function useRunLogs(
  s: ConnectionSettings,
  runId: string | null,
  options: FollowRunLogsOptions = {},
): RunLogsState {
  const [buffer, setBuffer] = useState<LogBuffer>(() => createLogBuffer());
  const [status, setStatus] = useState<RunStatus | null>(null);

  const stream = useServerStream<RunLogChunk>(
    (signal) => followRunLogs(s, runId ?? '', options, signal),
    {
      enabled: Boolean(runId),
      backoffMs: 1000,
      maxBackoffMs: 10_000,
      isTerminal: (chunk) => chunk.isFinal,
      onMessage: (chunk) => {
        if (chunk.runStatus !== RunStatus.UNSPECIFIED) setStatus(chunk.runStatus);
        setBuffer((b) => appendLogChunk(b, chunk));
      },
    },
  );

  const { reset: streamReset } = stream;
  const reset = useCallback(() => {
    setBuffer(createLogBuffer());
    setStatus(null);
    streamReset();
  }, [streamReset]);

  return { lines: buffer.lines, status, connected: stream.connected, error: stream.error, reset };
}
