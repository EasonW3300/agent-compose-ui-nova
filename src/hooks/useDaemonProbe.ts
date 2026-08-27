import { useEffect, useState } from 'react';
import { loadConnectionSettings, probeDaemon } from '../api/connection';

export type ProbeState = 'probing' | 'online' | 'offline';

/**
 * 加载连接设置并轮询健康探测：
 * probing 起步；ok → online（停止轮询）；down → offline（此后每 3 秒重试，
 * 以便用户在装机向导里跑完安装脚本后页面能自动感知）。
 * 注意：online 后停止轮询；daemon 会话中死亡不会自动翻回（§10.1 双向切换留待 Phase 2）。
 */
export function useDaemonProbe(): { state: ProbeState } {
  const [state, setState] = useState<ProbeState>('probing');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const tick = async () => {
      try {
        const result = await probeDaemon(loadConnectionSettings());
        if (cancelled) return;
        if (result === 'ok') {
          setState('online');
        } else {
          setState('offline');
          timer = setTimeout(tick, 3000);
        }
      } catch {
        if (cancelled) return;
        setState('offline');
        timer = setTimeout(tick, 3000);
      }
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { state };
}
