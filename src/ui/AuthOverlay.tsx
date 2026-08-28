import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UNAUTHORIZED_EVENT, checkAccess, loadConnectionSettings, saveConnectionSettings } from '../api/connection';

type State = 'idle' | 'checking' | 'invalid' | 'unreachable';

/** 全局 401 登录浮层：任何受保护 RPC 收到 401 时弹出，校验通过后清空查询缓存重连。 */
export function AuthOverlay() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    const onAuth = () => {
      setToken(loadConnectionSettings().authToken);
      setState('idle');
      setOpen(true);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onAuth);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onAuth);
  }, []);

  if (!open) return null;

  async function submit() {
    setState('checking');
    const s = { ...loadConnectionSettings(), authToken: token };
    saveConnectionSettings(s);
    const result = await checkAccess(s);
    if (result === 'ok') {
      setOpen(false);
      queryClient.invalidateQueries();
    } else if (result === 'invalid') {
      setState('invalid');
    } else {
      setState('unreachable');
    }
  }

  return (
    <div className="auth-overlay" role="dialog" aria-label="访问密钥失效">
      <h2>访问密钥失效</h2>
      <p>agent-compose 返回了「未授权」。重新输入访问密钥以继续（没有就留空直接重试）。</p>
      <label htmlFor="auth-overlay-token">访问密钥</label>
      <input
        id="auth-overlay-token"
        type="password"
        value={token}
        disabled={state === 'checking'}
        onChange={(e) => setToken(e.target.value)}
      />
      {state === 'invalid' && <p role="alert" className="auth-overlay__msg auth-overlay__msg--error">密钥不正确，请重试。</p>}
      {state === 'unreachable' && <p role="alert" className="auth-overlay__msg auth-overlay__msg--error">连不上 agent-compose，稍后再试。</p>}
      <div className="auth-overlay__actions">
        <button type="button" className="setup-btn" disabled={state === 'checking'} onClick={submit}>
          {state === 'checking' ? '连接中…' : '保存并重新连接'}
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setOpen(false)}>
          取消
        </button>
      </div>
    </div>
  );
}
