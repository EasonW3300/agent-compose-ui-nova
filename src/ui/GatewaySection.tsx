import { useEffect, useMemo, useState } from 'react';
import { getCapabilityGatewayConfig, updateCapabilityGatewayConfig } from '../api/settings';
import { loadConnectionSettings } from '../api/connection';
import './console.css';

export function GatewaySection() {
  // loadConnectionSettings() 每次调用都返回新对象；useMemo 让 effect 依赖 [s] 稳定，避免每次渲染重拉配置
  const s = useMemo(() => loadConnectionSettings(), []);
  const [addr, setAddr] = useState('');
  const [token, setToken] = useState('');
  const [tokenSet, setTokenSet] = useState(false);
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'saved'>('loading');

  useEffect(() => {
    getCapabilityGatewayConfig(s)
      .then((cfg) => {
        setAddr(cfg?.addr ?? '');
        setTokenSet(cfg?.tokenSet ?? false);
        setStatus('idle');
      })
      .catch(() => setStatus('idle'));
  }, [s]);

  const save = async () => {
    setStatus('saving');
    try {
      await updateCapabilityGatewayConfig(s, { addr, token: token ? token : undefined });
      setStatus('saved');
      if (token) { setToken(''); setTokenSet(true); }
    } catch {
      setStatus('idle');
    }
  };

  return (
    <details className="set-section wizard-advanced" data-testid="gateway">
      <summary>进阶：能力网关（Capability Gateway）</summary>
      {status !== 'loading' && (
        <>
          <p className="run-section__empty">连接外部能力网关（MCP 等）。改动立即生效。</p>
          <label>
            网关地址
            <input value={addr} onChange={(e) => setAddr(e.target.value)} aria-label="网关地址" placeholder="tcp://127.0.0.1:9000" />
          </label>
          <label>
            访问令牌{tokenSet && <span className="dash-live">（已配置）</span>}
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} aria-label="访问令牌" placeholder="留空则保持现有令牌" />
          </label>
          <div className="auth-overlay__actions">
            <button type="button" className="setup-btn" disabled={status === 'saving'} onClick={save}>{status === 'saving' ? '正在保存…' : '保存配置'}</button>
            {status === 'saved' && <span className="dash-live">已保存</span>}
          </div>
        </>
      )}
    </details>
  );
}
