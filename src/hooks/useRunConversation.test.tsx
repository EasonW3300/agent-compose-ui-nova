import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionSettings } from '../api/connection';
import { useRunConversation } from './useRunConversation';

// waitFor observes React Query's asynchronously committed mutation state; mutateAsync rejecting
// alone does not guarantee the hook consumer has rendered its error state in the same microtask.

const sendMock = vi.fn();

vi.mock('../api/runs', () => ({
  sendRunHumanMessage: (...args: unknown[]) => sendMock(...args),
}));

const settings: ConnectionSettings = { baseUrl: 'http://127.0.0.1:5175', authToken: '' };

function wrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useRunConversation', () => {
  beforeEach(() => {
    sendMock.mockReset().mockResolvedValue({ runId: 'r1' });
  });

  it('发送回复时携带调用本次生成的幂等 ID，并在成功后失效精确缓存键', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRunConversation(settings, 'r1'), { wrapper: wrapper(queryClient) });

    await act(async () => {
      await result.current.send('日志在 /workspace/log.md');
    });

    expect(sendMock).toHaveBeenCalledWith(settings, 'r1', '日志在 /workspace/log.md', expect.any(String));
    expect(invalidateSpy).toHaveBeenCalledTimes(5);
    expect(invalidateSpy).toHaveBeenNthCalledWith(1, { queryKey: ['run', 'r1'], exact: true });
    expect(invalidateSpy).toHaveBeenNthCalledWith(2, { queryKey: ['run-events', 'r1'], exact: true });
    expect(invalidateSpy).toHaveBeenNthCalledWith(3, { queryKey: ['runs'], exact: true });
    expect(invalidateSpy).toHaveBeenNthCalledWith(4, { queryKey: ['agents'], exact: true });
    expect(invalidateSpy).toHaveBeenNthCalledWith(5, { queryKey: ['dashboard'], exact: true });
  });

  it('发送失败时不失效缓存，并暴露错误状态', async () => {
    const failure = new Error('reply rejected');
    sendMock.mockRejectedValueOnce(failure);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRunConversation(settings, 'r1'), { wrapper: wrapper(queryClient) });

    await act(async () => {
      await expect(result.current.send('补充信息')).rejects.toThrow('reply rejected');
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
    // The transport promise rejects before MutationObserver notifies React. Wait for the state
    // exposed to UI consumers instead of assuming both lifecycles complete together.
    await waitFor(() => {
      expect(result.current.error).toBe(failure);
      expect(result.current.isSending).toBe(false);
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
