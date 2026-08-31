import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useServerStream } from './useServerStream';

/** 造一个可控服务端流：yield items；throwAt 命中则抛错。 */
function streamOf<T>(items: T[], throwAt?: number) {
  return async function* (): AsyncIterable<T> {
    for (let i = 0; i < items.length; i += 1) {
      if (throwAt === i) throw new Error('boom');
      yield items[i];
    }
  };
}

function makeSubscribe<T>(builders: Array<(call: number) => AsyncIterable<T>>) {
  const subscribedSignals: AbortSignal[] = [];
  const subscribe = vi.fn((signal: AbortSignal) => {
    subscribedSignals.push(signal);
    return builders[subscribe.mock.calls.length - 1](subscribe.mock.calls.length);
  });
  return { subscribe, subscribedSignals };
}

describe('useServerStream', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('累积消息、connected 随订阅切换、isTerminal 命中后不再重连', async () => {
    const { subscribe } = makeSubscribe<string>([() => streamOf(['a', 'b'], 99)()]);
    const { result } = renderHook(() =>
      useServerStream(subscribe, { isTerminal: (m) => m === 'b' }),
    );
    await act(async () => { await Promise.resolve(); });
    expect(result.current.messages).toEqual(['a', 'b']);
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBeNull();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('断线后按指数退避重连，消息跨重连累积，成功续传', async () => {
    vi.useFakeTimers();
    // 第 1 次订阅：yield 'a' 后立即抛错；第 2 次订阅：yield 'c' 后 yield 终止消息 'done'
    const { subscribe } = makeSubscribe<string>([
      () => streamOf(['a', 'b'], 1)(),
      () => streamOf(['c', 'done'])() as AsyncIterable<string>,
    ]);
    const { result } = renderHook(() =>
      useServerStream(subscribe, { isTerminal: (m) => m === 'done', backoffMs: 1000, maxBackoffMs: 4000 }),
    );
    // 第 1 轮：'a' 到位后抛错 → error 状态 + 调度重连
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.messages).toEqual(['a']);
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBe('连接中断，正在重试…');
    expect(subscribe).toHaveBeenCalledTimes(1);
    // 推进 1000ms → 第 2 次订阅跑起来并终止
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(result.current.messages).toEqual(['a', 'c', 'done']);
    expect(result.current.error).toBeNull();
    expect(result.current.connected).toBe(false);
    // 已终止：再推进很久也不该有第 3 次订阅
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('reset 清空消息并立即重连', async () => {
    const { subscribe } = makeSubscribe<string>([
      () => streamOf(['x'])() as AsyncIterable<string>,
      () => streamOf(['y', 'z'])() as AsyncIterable<string>,
    ]);
    const { result } = renderHook(() => useServerStream(subscribe, { isTerminal: () => false, backoffMs: 1000 }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.messages).toEqual(['x']);
    act(() => result.current.reset());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.messages).toEqual(['y', 'z']);
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('enabled=false 时不订阅', () => {
    const { subscribe } = makeSubscribe<string>([() => streamOf(['a'])() as AsyncIterable<string>]);
    renderHook(() => useServerStream(subscribe, { isTerminal: () => false, enabled: false }));
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('卸载即取消：abort 信号触发且不再重连', async () => {
    vi.useFakeTimers();
    const { subscribe, subscribedSignals } = makeSubscribe<string>([
      () => streamOf(['a', 'b'])() as AsyncIterable<string>,
    ]);
    const { unmount } = renderHook(() =>
      useServerStream(subscribe, { isTerminal: () => false, backoffMs: 1000, maxBackoffMs: 5000 }),
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // 第 1 轮完成（非终止）→ 已调度重连
    const abortSpy = vi.fn();
    subscribedSignals[0].addEventListener('abort', abortSpy);
    unmount();
    expect(abortSpy).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); }); // 定时器已被清掉
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('accumulate=false 不存消息但仍跑 onMessage', async () => {
    const onMessage = vi.fn();
    const { subscribe } = makeSubscribe<string>([() => streamOf(['a', 'b'])() as AsyncIterable<string>]);
    const { result } = renderHook(() =>
      useServerStream(subscribe, { isTerminal: () => false, accumulate: false, onMessage }),
    );
    await act(async () => { await vi.waitFor(() => expect(onMessage).toHaveBeenCalledTimes(2)); });
    expect(result.current.messages).toEqual([]);
  });
});
