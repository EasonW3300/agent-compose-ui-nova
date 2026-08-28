import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentCard } from '../domain/agentCard';
import { AgentCard as AgentCardComp } from './AgentCard';

const card: AgentCard = {
  key: 'p1:a1',
  projectId: 'p1',
  agentName: 'a1',
  projectName: 'proj',
  displayName: '我的日报',
  provider: 'claude',
  status: 'idle',
  schedulerEnabled: true,
  nextFireAt: new Date('2026-08-30T09:00:00Z'),
  latestRun: { runId: 'r1', statusLabel: '已完成', at: new Date('2026-08-29T08:00:00Z') },
};

describe('AgentCard', () => {
  it('展示名称、引擎、状态、下次运行、最近结果', () => {
    render(<AgentCardComp card={card} onRun={vi.fn()} onToggleEnabled={vi.fn()} onEdit={vi.fn()} onLogs={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('我的日报')).toBeInTheDocument();
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('待命中')).toBeInTheDocument();
    expect(screen.getByText(/下次：.*8月30日/)).toBeInTheDocument();
    expect(screen.getByText(/最近：已完成/)).toBeInTheDocument();
  });
  it('五个操作触发对应回调', async () => {
    const user = userEvent.setup();
    const handlers = { onRun: vi.fn(), onToggleEnabled: vi.fn(), onEdit: vi.fn(), onLogs: vi.fn(), onDelete: vi.fn() };
    render(<AgentCardComp card={card} {...handlers} />);
    await user.click(screen.getByRole('button', { name: /立即运行/ }));
    expect(handlers.onRun).toHaveBeenCalledWith(card);
    await user.click(screen.getByRole('button', { name: /暂停/ }));
    expect(handlers.onToggleEnabled).toHaveBeenCalledWith(card);
    await user.click(screen.getByRole('button', { name: /编辑/ }));
    expect(handlers.onEdit).toHaveBeenCalledWith(card);
    await user.click(screen.getByRole('button', { name: /日志/ }));
    expect(handlers.onLogs).toHaveBeenCalledWith(card);
    await user.click(screen.getByRole('button', { name: /删除/ }));
    expect(handlers.onDelete).toHaveBeenCalledWith(card);
  });
});
