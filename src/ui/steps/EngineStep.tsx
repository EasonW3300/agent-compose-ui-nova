import { useState } from 'react';
import { PROVIDERS } from '../../domain/labels';
import type { WizardStepProps } from './WizardStepProps';

export function EngineStep({ draft, update, goNext }: WizardStepProps) {
  const [error, setError] = useState<string | null>(null);
  function next() {
    if (!draft.provider) {
      setError('先选一个 AI 引擎，再继续。');
      return;
    }
    goNext();
  }
  return (
    <section aria-label="选 AI 引擎">
      <h2>选一个 AI 引擎</h2>
      <fieldset>
        <legend className="sr-only">AI 引擎</legend>
        {PROVIDERS.map((p) => (
          <label key={p.id} className="engine-card">
            <input
              type="radio"
              name="provider"
              checked={draft.provider === p.id}
              onChange={() => update({ provider: p.id })}
            />
            <strong>{p.label}</strong>
            <span>{p.tagline}</span>
            <span>{p.scenarios}</span>
          </label>
        ))}
      </fieldset>
      <label htmlFor="engine-model">模型型号（可留空用引擎默认）</label>
      <input
        id="engine-model"
        type="text"
        value={draft.model ?? ''}
        placeholder="例如 claude-sonnet-5 / gpt-5"
        onChange={(e) => update({ model: e.target.value })}
      />
      {error && <p role="alert">{error}</p>}
      <div className="wizard-nav">
        <button type="button" className="setup-btn" onClick={next}>继续</button>
      </div>
    </section>
  );
}
