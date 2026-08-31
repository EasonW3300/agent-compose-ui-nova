import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { SchedulerSection } from './SchedulerSection';

const mocks = {
  listProjects: vi.fn(), getProject: vi.fn(), getSchedulerNextFire: vi.fn(), listSchedulerEvents: vi.fn(),
};
vi.mock('../api/projects', () => ({
  listProjects: (...a: unknown[]) => mocks.listProjects(...a),
  getProject: (...a: unknown[]) => mocks.getProject(...a),
  projectRefById: (id: string) => ({ id }),
  getSchedulerNextFire: (...a: unknown[]) => mocks.getSchedulerNextFire(...a),
  listSchedulerEvents: (...a: unknown[]) => mocks.listSchedulerEvents(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));
vi.mock('../domain/resourceView', () => ({ schedulerLevelTone: (l: string) => (l === 'error' ? 'error' : 'info') }));

function PathStub() {
  const loc = useLocation();
  return <div>now at {loc.pathname}</div>;
}
function renderSection() {
  return renderWithClient(
    <MemoryRouter initialEntries={['/console/settings']}>
      <Routes>
        <Route path="/console/settings" element={<SchedulerSection />} />
        <Route path="/console/agents/:agentName/edit" element={<PathStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SchedulerSection', () => {
  beforeEach(() => {
    mocks.listProjects.mockReset().mockResolvedValue([{ projectId: 'p1' }]);
    mocks.getProject.mockReset().mockResolvedValue({
      summary: { projectId: 'p1', name: 'proj' },
      // AgentSpec 数据在 spec.agents（Project.agents 是 ProjectAgent[]，无 scheduler/name）
      spec: { agents: [{ name: 'my-report', displayName: '我的日报', scheduler: { enabled: true, intervalMinutes: 90 } }] },
    });
    mocks.getSchedulerNextFire.mockReset().mockResolvedValue(new Date('2026-09-01T09:00:00Z'));
    mocks.listSchedulerEvents.mockReset().mockResolvedValue([
      { id: 'e1', type: 'trigger', level: 'info', message: '到点触发', runId: 'r1', triggerId: '', payloadJson: '', createdAt: undefined },
      { id: 'e2', type: 'run', level: 'error', message: '触发失败', runId: 'r2', triggerId: '', payloadJson: '', createdAt: undefined },
    ]);
  });
  it('调度总览渲染助手名 + 已开启 + 下次触发时间（人话，非 —）', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText('我的日报')).toBeInTheDocument());
    expect(screen.getByText('已开启')).toBeInTheDocument();
    const fire = screen.getByText(/月.*日 \d{2}:\d{2}/);
    expect(fire).not.toHaveTextContent('—');
  });
  it('点击助手行跳 /console/agents/my-report/edit', async () => {
    const user = userEvent.setup();
    renderSection();
    await waitFor(() => expect(screen.getByText('我的日报')).toBeInTheDocument());
    await user.click(screen.getByText('我的日报'));
    await waitFor(() => expect(screen.getByText('now at /console/agents/my-report/edit')).toBeInTheDocument());
  });
  it('事件历史渲染 message + level 徽章（info/error）', async () => {
    renderSection();
    // 组件会把 message 与「（运行 {runId}）」拼在同一 span；用正则匹配 message 前缀
    await waitFor(() => expect(screen.getByText(/到点触发/)).toBeInTheDocument());
    expect(screen.getByText(/触发失败/)).toBeInTheDocument();
    expect(screen.getByText('info')).toBeInTheDocument();
    expect(screen.getByText('error')).toBeInTheDocument();
  });
});
