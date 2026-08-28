import { useCallback, useEffect, useRef, useState } from 'react';

export interface ServerStreamOptions<T> {
  /** 一条消息判定为终止 → 停止消费且不再重连。 */
  isTerminal: (msg: T) => boolean;
  /** 每条消息的副作用（如同步 runStatus）。返回 true 强制视为终止。 */
  onMessage?: (msg: T) => boolean | void;
  /** 断线后首次重连等待（默认 1000ms），按 2 倍指数退避至 maxBackoffMs。 */
  backoffMs?: number;
  /** 退避上限（默认 15000ms）。 */
  maxBackoffMs?: number;
  /** false 时不订阅（如 runId 未知）。 */
  enabled?: boolean;
  /** 是否把每条消息累积进 messages（默认 true）。只关心副作用时设 false（Dashboard）。 */
  accumulate?: boolean;
}

export interface ServerStreamState<T> {
  /** 已收到的全部消息（重连间累积不清空）。 */
  messages: T[];
  /** 当前是否有一个活跃的订阅在跑。 */
  connected: boolean;
  /** 最近一次断线的人话描述；null = 正常。 */
  error: string | null;
  /** 清空消息并立即重连。 */
  reset: () => void;
}

export function useServerStream<T>(
  subscribe: (signal: AbortSignal) => AsyncIterable<T>,
  options: ServerStreamOptions<T>,
): ServerStreamState<T> {
  const {
    isTerminal,
    onMessage,
    backoffMs = 1000,
    maxBackoffMs = 15000,
    enabled = true,
    accumulate = true,
  } = options;
  const [messages, setMessages] = useState<T[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const subscribeRef = useRef(subscribe);
  // oxlint-disable-next-line react/refs -- 最新 ref 模式：渲染期同步，供 effect 内消费
  subscribeRef.current = subscribe;
  const isTerminalRef = useRef(isTerminal);
  // oxlint-disable-next-line react/refs -- 最新 ref 模式：渲染期同步，供 effect 内消费
  isTerminalRef.current = isTerminal;
  const onMessageRef = useRef(onMessage);
  // oxlint-disable-next-line react/refs -- 最新 ref 模式：渲染期同步，供 effect 内消费
  onMessageRef.current = onMessage;
  const optsRef = useRef({ backoffMs, maxBackoffMs, accumulate });
  // oxlint-disable-next-line react/refs -- 最新 ref 模式：渲染期同步，供 effect 内消费
  optsRef.current = { backoffMs, maxBackoffMs, accumulate };

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    setGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let attempts = 0;
    let controller: AbortController | null = null;
    let timer: number | null = null;

    const clearTimer = () => {
      if (timer != null) clearTimeout(timer);
      timer = null;
    };

    const schedule = () => {
      if (cancelled) return;
      const delay = Math.min(optsRef.current.backoffMs * 2 ** attempts, optsRef.current.maxBackoffMs);
      attempts += 1;
      timer = setTimeout(() => void run(), delay);
    };

    const run = async () => {
      clearTimer();
      if (cancelled) return;
      controller = new AbortController();
      setConnected(true);
      setError(null);
      try {
        const iter = subscribeRef.current(controller.signal);
        for await (const msg of iter) {
          if (cancelled) return;
          const forced = onMessageRef.current?.(msg);
          const terminal = isTerminalRef.current(msg) || forced === true;
          if (optsRef.current.accumulate) setMessages((m) => [...m, msg]);
          if (terminal) {
            setConnected(false);
            return;
          }
        }
        setConnected(false);
        schedule();
      } catch {
        if (cancelled) return;
        setConnected(false);
        setError('连接中断，正在重试…');
        schedule();
      }
    };

    void run();

    return () => {
      cancelled = true;
      clearTimer();
      controller?.abort();
    };
  }, [enabled, generation]);

  return { messages, connected, error, reset };
}
