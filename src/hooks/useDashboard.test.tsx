import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from '@bufbuild/protobuf';
import {
  DashboardOverviewSchema,
  RunOverviewSchema,
  type DashboardOverview,
} from '../api/gen/agentcompose/v2/agentcompose_pb';
import { useDashboard } from './useDashboard';

const getOverviewMock = vi.fn();
const watchMock = vi.fn();
vi.mock('../api/runs', () => ({
  getDashboardOverview: (...a: unknown[]) => getOverviewMock(...a),
  watchDashboardOverview: (...a: unknown[]) => watchMock(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

function overview(runningCount: number, recentCount: number, attentionCount: number): DashboardOverview {
  return create(DashboardOverviewSchema, {
    runs: create(RunOverviewSchema, { runningCount, recentCount, attentionCount }),
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
}

describe('useDashboard', () => {
  beforeEach(() => {
    getOverviewMock.mockReset().mockResolvedValue(overview(1, 3, 0));
    watchMock.mockReset();
  });

  it('unary 初始 + watch 每帧经 setQueryData 刷新同一 queryKey', async () => {
    watchMock.mockImplementation(() =>
      (async function* (): AsyncIterable<{ overview: DashboardOverview | undefined; reason: string }> {
        // 与生产时序一致：unary（快速 HTTP）先落地，watch 首帧随后到达。
        // 若首帧立即 yield，会与 unary 的 success dispatch 竞态（后者因 retryer 多层
        // microtask 反而后到并覆盖 watch 快照），故推迟一帧保证 unary 先行。
        await new Promise((r) => setTimeout(r, 50));
        yield { overview: overview(4, 9, 1), reason: '' };
      })(),
    );
    const { result } = renderHook(() => useDashboard(), { wrapper });
    // 初始 unary 数据先落地
    await waitFor(() => expect(result.current.overview?.runs?.runningCount).toBe(1));
    // watch 帧覆盖为最新快照
    await waitFor(() => expect(result.current.overview?.runs?.runningCount).toBe(4));
    expect(result.current.overview?.runs?.attentionCount).toBe(1);
    expect(getOverviewMock).toHaveBeenCalledTimes(1);
    expect(watchMock).toHaveBeenCalledTimes(1);
  });

  it('watch 帧 overview 缺失时不动 query', async () => {
    watchMock.mockImplementation(() =>
      (async function* (): AsyncIterable<{ overview: DashboardOverview | undefined; reason: string }> {
        yield { overview: undefined, reason: 'not ready' };
      })(),
    );
    const { result } = renderHook(() => useDashboard(), { wrapper });
    await waitFor(() => expect(result.current.overview?.runs?.runningCount).toBe(1));
    // 等若干 tick 确保 watch 帧已消费，query 仍保持 unary 值
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.overview?.runs?.runningCount).toBe(1);
  });
});
