import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyDraft, type AgentDraft } from '../../domain/agentDraft';
import { MaterialsStep } from './MaterialsStep';

/** 受控组件需真状态驱动渲染（模拟 CreateWizard 的 update→setDraft 回路）。 */
function MaterialsStepHarness({ onUpdate }: { onUpdate: (patch: Partial<AgentDraft>) => void }) {
  const [draft, setDraft] = useState<AgentDraft>(emptyDraft());
  const update = (patch: Partial<AgentDraft>) => {
    onUpdate(patch);
    setDraft((d) => ({ ...d, ...patch }));
  };
  return <MaterialsStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />;
}

describe('MaterialsStep', () => {
  it('工作区三选：空/本地路径/Git', () => {
    render(<MaterialsStep draft={emptyDraft()} update={vi.fn()} goNext={vi.fn()} goBack={vi.fn()} />);
    for (const name of ['不用工作区', '本地文件夹', 'Git 仓库']) {
      expect(screen.getByRole('radio', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });
  it('选本地路径写入 workspace.local', async () => {
    const update = vi.fn();
    const user = userEvent.setup();
    render(<MaterialsStepHarness onUpdate={update} />);
    await user.click(screen.getByRole('radio', { name: /本地文件夹/ }));
    await user.type(screen.getByLabelText('本地路径'), '/tmp/work');
    expect(update).toHaveBeenCalledWith({ workspace: { kind: 'local', path: '/tmp/work' } });
  });
  it('选 Git 写入 url + branch', async () => {
    const update = vi.fn();
    const user = userEvent.setup();
    render(<MaterialsStepHarness onUpdate={update} />);
    await user.click(screen.getByRole('radio', { name: /Git 仓库/ }));
    await user.type(screen.getByLabelText('Git 地址'), 'https://github.com/x/y.git');
    expect(update).toHaveBeenCalledWith({ workspace: { kind: 'git', url: 'https://github.com/x/y.git', branch: undefined } });
  });
  it('数据文件夹：添加源/目标/只读', async () => {
    const draft = emptyDraft();
    const update = vi.fn();
    const user = userEvent.setup();
    render(<MaterialsStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /加一个数据文件夹/ }));
    expect(update).toHaveBeenCalledWith({ volumes: [{ source: '', target: '', readOnly: false }] });
  });
  it('空工作区且没选材料也能继续', async () => {
    const goNext = vi.fn();
    const user = userEvent.setup();
    render(<MaterialsStep draft={emptyDraft()} update={vi.fn()} goNext={goNext} goBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '继续' }));
    expect(goNext).toHaveBeenCalled();
  });
});
