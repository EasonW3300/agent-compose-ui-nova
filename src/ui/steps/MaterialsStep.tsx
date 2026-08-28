import { useState } from 'react';
import type { WizardStepProps } from './WizardStepProps';

export function MaterialsStep({ draft, update, goNext }: WizardStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const kind = draft.workspace.kind;
  // 受控组件在 onChange 闭包里会丢失联合收窄，这里先把收窄后的工作区抓出来。
  const localWs = kind === 'local' ? draft.workspace : null;
  const gitWs = kind === 'git' ? draft.workspace : null;

  function next() {
    if (localWs && !localWs.path.trim()) {
      setError('本地文件夹要填路径。');
      return;
    }
    if (gitWs && !gitWs.url.trim()) {
      setError('Git 地址要填完整（https:// 开头）。');
      return;
    }
    goNext();
  }

  return (
    <section aria-label="工作材料">
      <h2>给它什么工作材料？</h2>
      <fieldset>
        <legend className="sr-only">工作区</legend>
        <label className="engine-card">
          <input type="radio" name="ws" checked={kind === 'none'} onChange={() => update({ workspace: { kind: 'none' } })} />
          <strong>不用工作区</strong><span>它只在自己的隔离工作台里干活</span>
        </label>
        <label className="engine-card">
          <input type="radio" name="ws" checked={kind === 'local'} onChange={() => update({ workspace: { kind: 'local', path: '' } })} />
          <strong>本地文件夹</strong><span>给它一个你电脑上的文件夹</span>
        </label>
        <label className="engine-card">
          <input type="radio" name="ws" checked={kind === 'git'} onChange={() => update({ workspace: { kind: 'git', url: '' } })} />
          <strong>Git 仓库</strong><span>克隆一个仓库作为材料</span>
        </label>
      </fieldset>

      {localWs && (
        <label htmlFor="ws-path">本地路径</label>
      )}
      {localWs && (
        <input id="ws-path" type="text" value={localWs.path} onChange={(e) => update({ workspace: { ...localWs, path: e.target.value } })} />
      )}
      {gitWs && (
        <label htmlFor="ws-url">Git 地址</label>
      )}
      {gitWs && (
        <input id="ws-url" type="text" value={gitWs.url} onChange={(e) => update({ workspace: { ...gitWs, url: e.target.value } })} />
      )}
      {gitWs && (
        <label htmlFor="ws-branch">分支（可留空）</label>
      )}
      {gitWs && (
        <input id="ws-branch" type="text" value={gitWs.branch ?? ''} onChange={(e) => update({ workspace: { ...gitWs, branch: e.target.value || undefined } })} />
      )}

      <h3>数据文件夹</h3>
      {draft.volumes.map((v, i) => (
        <div key={i} className="volume-row">
          <input aria-label="数据源" value={v.source} onChange={(e) => {
            const volumes = draft.volumes.map((x, j) => (j === i ? { ...x, source: e.target.value } : x));
            update({ volumes });
          }} />
          <input aria-label="目标路径" value={v.target} onChange={(e) => {
            const volumes = draft.volumes.map((x, j) => (j === i ? { ...x, target: e.target.value } : x));
            update({ volumes });
          }} />
          <label>
            <input type="checkbox" checked={v.readOnly} onChange={(e) => {
              const volumes = draft.volumes.map((x, j) => (j === i ? { ...x, readOnly: e.target.checked } : x));
              update({ volumes });
            }} />
            只读
          </label>
          <button type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ volumes: draft.volumes.filter((_, j) => j !== i) })}>删</button>
        </div>
      ))}
      <button type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ volumes: [...draft.volumes, { source: '', target: '', readOnly: false }] })}>
        + 加一个数据文件夹
      </button>

      <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setShowAdvanced((v) => !v)}>
        {showAdvanced ? '收起高级设置' : '高级设置'}
      </button>
      {showAdvanced && (
        <div className="wizard-advanced">
          <h4>插件（MCP）</h4>
          {draft.mcpServers.map((m, i) => (
            <div key={i} className="mcp-row">
              <input aria-label="插件名" value={m.name} onChange={(e) => update({ mcpServers: draft.mcpServers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input aria-label="插件地址" value={m.url ?? ''} onChange={(e) => update({ mcpServers: draft.mcpServers.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ mcpServers: draft.mcpServers.filter((_, j) => j !== i) })}>删</button>
            </div>
          ))}
          <button type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ mcpServers: [...draft.mcpServers, { name: '', type: 'remote', url: '' }] })}>+ 插件</button>
          <h4>技能包</h4>
          {draft.skills.map((k, i) => (
            <div key={i} className="skill-row">
              <input aria-label="技能包名" value={k.name} onChange={(e) => update({ skills: draft.skills.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ skills: draft.skills.filter((_, j) => j !== i) })}>删</button>
            </div>
          ))}
          <button type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ skills: [...draft.skills, { name: '' }] })}>+ 技能包</button>
          <label>
            <input type="checkbox" checked={draft.jupyterEnabled} onChange={(e) => update({ jupyterEnabled: e.target.checked })} />
            启用 Jupyter
          </label>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="wizard-nav">
        <button type="button" className="setup-btn" onClick={next}>继续</button>
      </div>
    </section>
  );
}
