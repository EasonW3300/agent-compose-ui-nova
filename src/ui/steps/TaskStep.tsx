import { useState } from 'react';
import type { WizardStepProps } from './WizardStepProps';

const EXAMPLES = [
  { label: '每天整理一下我的工作日志', text: '每天早上打开我的工作日志，整理成三条要点，并列出今天该跟进的事。' },
  { label: '监控一个网页的变化', text: '每 30 分钟检查一次 https://example.com 的价格，变化超过 5% 就写一份报告。' },
];

const ENV_EXAMPLES = ['TZ=Asia/Shanghai', 'LANG=zh_CN.UTF-8', 'HTTPS_PROXY=http://proxy.example:8080'];

export function TaskStep({ draft, update, goNext }: WizardStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  function next() {
    if (!draft.prompt.trim()) {
      setError('先说说要它干什么，一句话就行。');
      return;
    }
    goNext();
  }
  return (
    <section aria-label="任务说明">
      <h2>告诉它要干什么</h2>
      <label htmlFor="task-prompt">任务说明</label>
      <textarea
        id="task-prompt"
        rows={5}
        value={draft.prompt}
        placeholder="例如：每天早上 9 点，把销售报表里的数字汇总成一段人话总结。"
        onChange={(e) => update({ prompt: e.target.value })}
      />
      <div className="task-examples">
        {EXAMPLES.map((ex) => (
          <button key={ex.label} type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ prompt: ex.text })}>
            {ex.label}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setShowAdvanced((v) => !v)}>
        {showAdvanced ? '收起高级设置' : '高级设置'}
      </button>
      {showAdvanced && (
        <div className="wizard-advanced">
          <label htmlFor="task-sys">角色设定（system prompt）</label>
          <textarea
            id="task-sys"
            rows={3}
            value={draft.systemPrompt ?? ''}
            onChange={(e) => update({ systemPrompt: e.target.value })}
          />
          <div className="env-section__head">
            <h4>环境变量</h4>
            <button type="button" className="env-help" aria-label="查看环境变量说明">
              ?
              <span className="env-help__tooltip" role="tooltip">
                这些变量只传给当前 AI 助手。不要在这里填写 AI 引擎 API Key，请到“设置 → AI 引擎密钥”配置。
              </span>
            </button>
          </div>
          <p className="env-section__hint">
            通常无需填写。示例：{ENV_EXAMPLES.map((example) => <code key={example}>{example}</code>)}
          </p>
          {draft.env.map((pair, i) => (
            <div key={i} className="env-row">
              <label className="env-row__field">
                <span>变量名</span>
                <input
                  aria-label="变量名"
                  value={pair.key}
                  onChange={(e) => {
                    const env = draft.env.map((p, j) => (j === i ? { ...p, key: e.target.value } : p));
                    update({ env });
                  }}
                />
              </label>
              <label className="env-row__field">
                <span>变量值</span>
                <input
                  aria-label="变量值"
                  value={pair.value}
                  onChange={(e) => {
                    const env = draft.env.map((p, j) => (j === i ? { ...p, value: e.target.value } : p));
                    update({ env });
                  }}
                />
              </label>
              <button
                type="button"
                className="setup-btn setup-btn--ghost"
                onClick={() => update({ env: draft.env.filter((_, j) => j !== i) })}
              >
                删
              </button>
            </div>
          ))}
          <button
            type="button"
            className="setup-btn setup-btn--ghost"
            onClick={() => update({ env: [...draft.env, { key: '', value: '' }] })}
          >
            + 加一个环境变量
          </button>
        </div>
      )}
      <div className="wizard-nav">
        <button type="button" className="setup-btn" onClick={next}>继续</button>
      </div>
    </section>
  );
}
