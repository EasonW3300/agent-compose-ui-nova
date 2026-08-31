import { useEffect, useState } from 'react';
import { getGlobalEnv, updateGlobalEnv } from '../api/settings';
import { loadConnectionSettings } from '../api/connection';
import type { EnvVarSpec } from '../api/gen/agentcompose/v2/agentcompose_pb';
import './console.css';

interface Row { name: string; value: string; secret: boolean; key: string; }
let seq = 0;
const nextKey = () => `row-${seq++}`;

export function GlobalEnvSection() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'saved'>('loading');

  useEffect(() => {
    getGlobalEnv(loadConnectionSettings())
      .then((env: EnvVarSpec[]) => setRows(env.map((e) => ({ name: e.name, value: e.value, secret: e.secret, key: nextKey() }))))
      .catch(() => { setRows([]); setStatus('idle'); });
  }, []);

  if (!rows) return <p role="status">正在读取全局环境变量…</p>;

  const save = async () => {
    setStatus('saving');
    try {
      await updateGlobalEnv(loadConnectionSettings(), rows.map((r) => (r.secret ? { name: r.name, secret: true } : { name: r.name, value: r.value, secret: false })));
      setStatus('saved');
    } catch {
      setStatus('idle');
    }
  };

  return (
    <div className="set-section">
      <div className="run-section__head">
        <h3>全局环境变量</h3>
        <button type="button" className="setup-btn" onClick={() => setRows((r) => [...(r ?? []), { name: '', value: '', secret: false, key: nextKey() }])}>+ 添加</button>
      </div>
      <p className="run-section__empty">这些变量会注入到所有 AI 助手的工作环境。值带「密钥」标记的会掩码显示。</p>
      <table className="runs-table">
        <thead><tr><th>变量名</th><th>值</th><th>密钥</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td><input value={r.name} aria-label="变量名" onChange={(e) => setRows((rs) => (rs ?? []).map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))} /></td>
              <td><input type={r.secret ? 'password' : 'text'} value={r.value} aria-label="变量值" onChange={(e) => setRows((rs) => (rs ?? []).map((x) => (x.key === r.key ? { ...x, value: e.target.value } : x)))} /></td>
              <td><input type="checkbox" checked={r.secret} aria-label="标记为密钥" onChange={(e) => setRows((rs) => (rs ?? []).map((x) => (x.key === r.key ? { ...x, secret: e.target.checked } : x)))} /></td>
              <td><button type="button" className="setup-btn setup-btn--ghost" aria-label={`删除 ${r.name || '此行'}`} onClick={() => setRows((rs) => (rs ?? []).filter((x) => x.key !== r.key))}>删除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="auth-overlay__actions">
        <button type="button" className="setup-btn" disabled={status === 'saving'} onClick={save}>{status === 'saving' ? '正在保存…' : '保存环境变量'}</button>
        {status === 'saved' && <span className="dash-live">已保存</span>}
      </div>
    </div>
  );
}
