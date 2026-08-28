import { useEffect, useState } from 'react';
import { loadConnectionSettings } from '../api/connection';
import { errorKind, getGlobalEnv, updateGlobalEnv } from '../api/settings';
import { applyProviderKeyUpdates, PROVIDER_KEY_DEFS, providerKeyStatus } from '../domain/providerKeys';

type Status = 'loading' | 'idle' | 'saving' | 'saved' | 'auth' | 'unreachable' | 'other';

export function ProviderKeysScreen({ onNext }: { onNext: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [keyStatus, setKeyStatus] = useState<Record<string, 'configured' | 'missing'>>({});
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    getGlobalEnv(loadConnectionSettings())
      .then((env) => {
        setKeyStatus(providerKeyStatus(env, PROVIDER_KEY_DEFS));
        setStatus('idle');
      })
      .catch((err) => setStatus(errorKind(err)));
  }, []);

  const save = async () => {
    setStatus('saving');
    try {
      const existing = await getGlobalEnv(loadConnectionSettings());
      const updates = PROVIDER_KEY_DEFS.map((def) => ({ envVarName: def.envVarName, value: values[def.envVarName] ?? '' }));
      await updateGlobalEnv(loadConnectionSettings(), applyProviderKeyUpdates(existing, updates));
      setStatus('saved');
    } catch (err) {
      setStatus(errorKind(err));
    }
  };

  if (status === 'loading') return <p role="status">正在读取密钥配置…</p>;

  return (
    <section className="provider-keys" aria-label="密钥配置">
      <h2>给 AI 引擎填密钥</h2>
      <p>填了密钥的引擎才能干活。这些密钥只保存在你自己电脑上；可以先跳过，之后在「设置」里补。</p>
      <div className="key-cards">
        {PROVIDER_KEY_DEFS.map((def) => (
          <div key={def.provider} className="key-card">
            <h3>
              {def.label}
              {keyStatus[def.envVarName] === 'configured' && <span className="key-card__badge">已配置</span>}
            </h3>
            <input
              type="password"
              aria-label={`${def.label} 密钥`}
              value={values[def.envVarName] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [def.envVarName]: e.target.value }))}
              placeholder={def.hint}
            />
            {def.envVarName === 'OPENAI_API_KEY' && def.provider !== 'codex' && (
              <p className="key-card__note">与 Codex 共用同一个 OpenAI 兼容密钥。</p>
            )}
          </div>
        ))}
      </div>
      <div className="login__actions">
        <button type="button" className="setup-btn" onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? '正在保存…' : '保存密钥'}
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={onNext}>
          跳过，稍后在设置里配置
        </button>
      </div>
      {status === 'saved' && <p role="status" className="login__msg login__msg--ok">密钥已保存。</p>}
      {status === 'auth' && (
        <p role="alert" className="login__msg login__msg--error">访问密钥不正确或缺失，密钥未保存。请返回上一步填写访问密钥。</p>
      )}
      {status === 'unreachable' && <p role="alert" className="login__msg login__msg--warn">暂时连不上 agent-compose，密钥未保存。</p>}
    </section>
  );
}
