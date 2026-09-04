import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyDraft, type AgentDraft } from '../../domain/agentDraft';
import { TaskStep } from './TaskStep';

/** 受控组件需真状态驱动渲染（模拟 CreateWizard 的 update→setDraft 回路）。 */
function TaskStepHarness({ onUpdate }: { onUpdate: (patch: Partial<AgentDraft>) => void }) {
  const [draft, setDraft] = useState<AgentDraft>({ ...emptyDraft(), prompt: 'x' });
  const update = (patch: Partial<AgentDraft>) => {
    onUpdate(patch);
    setDraft((d) => ({ ...d, ...patch }));
  };
  return <TaskStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />;
}

describe('TaskStep', () => {
  it('点示例填入任务说明', async () => {
    const draft = emptyDraft();
    const update = vi.fn();
    const user = userEvent.setup();
    render(<TaskStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /每天整理/ }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringMatching(/整理/) }));
  });
  it('空任务说明拦截继续', async () => {
    const goNext = vi.fn();
    const user = userEvent.setup();
    render(<TaskStep draft={emptyDraft()} update={vi.fn()} goNext={goNext} goBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '继续' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/先说说要它干什么/);
    expect(goNext).not.toHaveBeenCalled();
  });
  it('折叠区能添加环境变量', async () => {
    const update = vi.fn();
    const user = userEvent.setup();
    render(<TaskStepHarness onUpdate={update} />);
    await user.click(screen.getByRole('button', { name: /高级设置/ }));
    await user.click(screen.getByRole('button', { name: /加一个环境变量/ }));
    await user.type(screen.getAllByLabelText('变量名')[0], 'TZ');
    await user.type(screen.getAllByLabelText('变量值')[0], 'Asia/Shanghai');
    expect(update).toHaveBeenCalledWith({ env: [{ key: 'TZ', value: 'Asia/Shanghai' }] });
  });
  it('解释当前助手的环境变量并展示示例', async () => {
    const user = userEvent.setup();
    render(<TaskStepHarness onUpdate={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /高级设置/ }));
    await user.click(screen.getByRole('button', { name: /加一个环境变量/ }));

    expect(screen.getAllByText('变量名')).not.toHaveLength(0);
    expect(screen.getAllByText('变量值')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: '查看环境变量说明' })).toBeInTheDocument();
    expect(screen.getByText(/通常无需填写/)).toBeInTheDocument();
    expect(screen.getByText('TZ=Asia/Shanghai')).toBeInTheDocument();
    expect(screen.getByText('LANG=zh_CN.UTF-8')).toBeInTheDocument();
    expect(screen.getByText('HTTPS_PROXY=http://proxy.example:8080')).toBeInTheDocument();
  });
});
