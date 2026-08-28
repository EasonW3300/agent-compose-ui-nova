import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyDraft, type AgentDraft } from '../../domain/agentDraft';
import { ConfirmStep } from './ConfirmStep';

const draft: AgentDraft = {
  ...emptyDraft(),
  provider: 'codex',
  name: 'my bot',
  displayName: '我的机器人',
  prompt: '整理日志',
  schedule: { kind: 'interval', minutes: 90 },
};

describe('ConfirmStep', () => {
  it('展示人话摘要 + YAML 预览', () => {
    render(<ConfirmStep draft={draft} issues={[]} busy={false} update={vi.fn()} onTestRun={vi.fn()} onSave={vi.fn()} onJumpTo={vi.fn()} />);
    expect(screen.getByText('我的机器人')).toBeInTheDocument();
    expect(screen.getByText(/每 1 小时 30 分钟一次/)).toBeInTheDocument();
    expect(screen.getByText('codex', { selector: 'dd' })).toBeInTheDocument();
    const yaml = screen.getByRole('region', { name: /YAML 预览/ });
    expect(yaml).toHaveTextContent('provider: codex');
  });
  it('保存按钮触发 onSave；测试运行按钮触发 onTestRun', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onTestRun = vi.fn();
    render(<ConfirmStep draft={draft} issues={[]} busy={false} update={vi.fn()} onTestRun={onTestRun} onSave={onSave} onJumpTo={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(onSave).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /测试运行一次/ }));
    expect(onTestRun).toHaveBeenCalled();
  });
  it('校验 issues 人话展示并可按步骤回跳', async () => {
    const user = userEvent.setup();
    const onJumpTo = vi.fn();
    render(
      <ConfirmStep
        draft={draft}
        issues={[{ severity: 2, path: 'agents.0.provider', message: 'provider 不支持' }]}
        busy={false}
        update={vi.fn()}
        onTestRun={vi.fn()}
        onSave={vi.fn()}
        onJumpTo={onJumpTo}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/provider 不支持/);
    await user.click(screen.getByRole('button', { name: /回第 1 步/ }));
    expect(onJumpTo).toHaveBeenCalledWith(0);
  });
});
