import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentDraft } from '../../domain/agentDraft';
import { emptyDraft } from '../../domain/agentDraft';
import { EngineStep } from './EngineStep';

function renderStep(draft: AgentDraft, update = vi.fn(), goNext = vi.fn()) {
  return { user: userEvent.setup(), update, goNext, ...render(<EngineStep draft={draft} update={update} goNext={goNext} goBack={vi.fn()} />) };
}

/** 受控输入需真状态驱动渲染（模拟 CreateWizard 的 update→setDraft 回路）。 */
function EngineStepHarness({ onUpdate }: { onUpdate: (patch: Partial<AgentDraft>) => void }) {
  const [draft, setDraft] = useState<AgentDraft>(emptyDraft());
  const update = (patch: Partial<AgentDraft>) => {
    onUpdate(patch);
    setDraft((d) => ({ ...d, ...patch }));
  };
  return <EngineStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />;
}

describe('EngineStep', () => {
  it('展示四个引擎卡片', () => {
    renderStep(emptyDraft());
    for (const name of ['Claude Code', 'Codex', 'Pi', 'DSH']) {
      expect(screen.getByRole('radio', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });
  it('选择引擎与输入模型会写入草稿', async () => {
    const update = vi.fn();
    const user = userEvent.setup();
    render(<EngineStepHarness onUpdate={update} />);
    await user.click(screen.getByRole('radio', { name: /Codex/ }));
    expect(update).toHaveBeenCalledWith({ provider: 'codex' });
    await user.type(screen.getByLabelText(/模型型号/), 'gpt-5');
    expect(update).toHaveBeenCalledWith({ model: 'gpt-5' });
  });
  it('未选引擎时点继续给提示并拦截', async () => {
    const goNext = vi.fn();
    // 空草稿默认 provider=claude（裁决 1）；「未选引擎」需显式置空 provider。
    const noEngine: AgentDraft = { ...emptyDraft(), provider: undefined as unknown as AgentDraft['provider'] };
    const { user } = renderStep(noEngine, vi.fn(), goNext);
    await user.click(screen.getByRole('button', { name: '继续' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/选一个 AI 引擎/);
    expect(goNext).not.toHaveBeenCalled();
  });
});
