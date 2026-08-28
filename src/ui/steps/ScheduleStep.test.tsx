import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyDraft, type AgentDraft } from '../../domain/agentDraft';
import { ScheduleStep } from './ScheduleStep';

/** 受控组件需真状态驱动渲染（模拟 CreateWizard 的 update→setDraft 回路）。 */
function ScheduleStepHarness({ onUpdate }: { onUpdate: (patch: Partial<AgentDraft>) => void }) {
  const [draft, setDraft] = useState<AgentDraft>(emptyDraft());
  const update = (patch: Partial<AgentDraft>) => {
    onUpdate(patch);
    setDraft((d) => ({ ...d, ...patch }));
  };
  return <ScheduleStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />;
}

describe('ScheduleStep', () => {
  it('三种触发方式可视化卡片', () => {
    render(<ScheduleStep draft={emptyDraft()} update={vi.fn()} goNext={vi.fn()} goBack={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /手动/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /定时/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /固定间隔/ })).toBeInTheDocument();
  });
  it('选定时展开 每天/每周 + 时间选择，写入 daily', async () => {
    const draft = emptyDraft();
    const update = vi.fn();
    const user = userEvent.setup();
    render(<ScheduleStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /定时/ }));
    await user.click(screen.getByRole('radio', { name: /每天/ }));
    expect(update).toHaveBeenCalledWith({ schedule: { kind: 'daily', hour: 9, minute: 0 } });
  });
  it('选固定间隔填数字写入 interval', async () => {
    const update = vi.fn();
    const user = userEvent.setup();
    render(<ScheduleStepHarness onUpdate={update} />);
    await user.click(screen.getByRole('radio', { name: /固定间隔/ }));
    await user.type(screen.getByLabelText('间隔分钟数'), '90');
    expect(update).toHaveBeenCalledWith({ schedule: { kind: 'interval', minutes: 90 } });
  });
  it('超时折叠区写 timeoutMinutes', async () => {
    const update = vi.fn();
    const user = userEvent.setup();
    render(<ScheduleStepHarness onUpdate={update} />);
    await user.click(screen.getByRole('button', { name: /高级设置/ }));
    await user.type(screen.getByLabelText('超时分钟数'), '60');
    expect(update).toHaveBeenCalledWith({ timeoutMinutes: 60 });
  });
});
