import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDaemonProbe } from './useDaemonProbe';

const probeMock = vi.fn();
vi.mock('../api/connection', async (orig) => {
  const actual = await orig<typeof import('../api/connection')>();
  return {
    ...actual,
    loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }),
    probeDaemon: (...args: unknown[]) => probeMock(...args),
  };
});

afterEach(() => vi.restoreAllMocks());

describe('useDaemonProbe', () => {
  it('首次探测成功转为 online 并停止轮询', async () => {
    probeMock.mockResolvedValue('ok');
    const { result } = renderHook(() => useDaemonProbe());
    await waitFor(() => expect(result.current.state).toBe('online'));
    expect(probeMock).toHaveBeenCalledTimes(1);
  });
  it('探测失败保持 offline', async () => {
    probeMock.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useDaemonProbe());
    await waitFor(() => expect(result.current.state).toBe('offline'));
    expect(result.current.state).toBe('offline');
  });
});
