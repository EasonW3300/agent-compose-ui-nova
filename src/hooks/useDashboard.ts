import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import type { DashboardOverview, WatchDashboardOverviewResponse } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { getDashboardOverview, watchDashboardOverview } from '../api/runs';
import { useServerStream } from './useServerStream';

export const DASHBOARD_KEY = ['dashboard'] as const;

export interface DashboardState {
  overview: DashboardOverview | undefined;
  isLoading: boolean;
  isError: boolean;
  /** watch 订阅是否活跃（用于「实时」指示）。 */
  connected: boolean;
  refetch: () => void;
}

export function useDashboard(): DashboardState {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: async () => {
      const s = loadConnectionSettings();
      return getDashboardOverview(s);
    },
    staleTime: 30_000,
  });

  // §8 流式封装：watch 每帧把最新快照写入同一 queryKey（unary 只做首屏兜底）。
  const stream = useServerStream<WatchDashboardOverviewResponse>(
    (signal) => {
      const s = loadConnectionSettings();
      return watchDashboardOverview(s, signal);
    },
    {
      backoffMs: 2000,
      maxBackoffMs: 30_000,
      accumulate: false,
      isTerminal: () => false,
      onMessage: (res) => {
        if (res.overview) queryClient.setQueryData(DASHBOARD_KEY, res.overview);
      },
    },
  );

  return {
    overview: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    connected: stream.connected,
    refetch: () => void query.refetch(),
  };
}
