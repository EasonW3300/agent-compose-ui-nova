import { useState } from 'react';
import { checkAccess, loadConnectionSettings, saveConnectionSettings, type ConnectionSettings } from '../api/connection';

type Status = 'idle' | 'checking' | 'ok' | 'invalid' | 'unreachable';

export function LoginScreen({ onNext }: { onNext: () => void }) {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const submit = async () => {
    setStatus('checking');
    const settings: ConnectionSettings = { ...loadConnectionSettings(), authToken: key.trim() };
    saveConnectionSettings(settings);
    const result = await checkAccess(settings);
    if (result === 'invalid') {
      setStatus('invalid');
      return;
    }
    setStatus(result);
    onNext();
  };

  return (
    <section className="login" aria-label="首次登录">
      <h2>访问密钥（可选）</h2>
      <p>安装 agent-compose 时如果设置了访问密钥，粘贴到这里；没设置的话直接点「继续」。</p>
      <input
        type="password"
        aria-label="访问密钥"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="粘贴访问密钥（没有就留空）"
      />
      <div className="login__actions">
        <button type="button" className="setup-btn" onClick={submit} disabled={status === 'checking'}>
          {status === 'checking' ? '正在检查…' : '保存并继续'}
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={onNext}>
          没有密钥，直接下一步
        </button>
      </div>
      {status === 'invalid' && (
        <p role="alert" className="login__msg login__msg--error">
          密钥不正确，请检查后重试；或者点「没有密钥，直接下一步」跳过。
        </p>
      )}
      {status === 'unreachable' && (
        <p role="alert" className="login__msg login__msg--warn">
          暂时连不上 agent-compose。密钥已保存，等它启动后会自动进入主控台。
        </p>
      )}
      {status === 'ok' && (
        <p role="status" className="login__msg login__msg--ok">
          密钥已保存，可以继续了。
        </p>
      )}
    </section>
  );
}
