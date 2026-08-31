import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

const probeMock = vi.fn();
vi.mock('./api/connection', async (orig) => {
  const actual = await orig<typeof import('./api/connection')>();
  return {
    ...actual,
    loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }),
    probeDaemon: (...args: unknown[]) => probeMock(...args),
  };
});

// App 引用真实 AgentListScreen/CreateWizard，它们会触发 useAgents 等网络查询；
// mock 掉后 App 路由仍照常渲染，只是内容换成 stub 文本。
vi.mock('./ui/AgentListScreen', () => ({ AgentListScreen: () => <div>AgentListScreen stub</div> }));
vi.mock('./ui/CreateWizard', () => ({ CreateWizard: () => <div>CreateWizard stub</div> }));
vi.mock('./ui/DashboardScreen', () => ({ DashboardScreen: () => <div>DashboardScreen stub</div> }));
vi.mock('./ui/RunsScreen', () => ({ RunsScreen: () => <div>RunsScreen stub</div> }));
vi.mock('./ui/RunDetailScreen', () => ({ RunDetailScreen: () => <div>RunDetailScreen stub</div> }));
vi.mock('./ui/ResourcesScreen', () => ({ ResourcesScreen: () => <div>ResourcesScreen stub</div> }));
vi.mock('./ui/SettingsScreen', () => ({ SettingsScreen: () => <div>SettingsScreen stub</div> }));

import App from './App';

describe('App 双世界决策', () => {
  it('在线时进入主控台（含主导航）', async () => {
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument(),
    );
  });
  it('离线时展示装机向导', async () => {
    probeMock.mockRejectedValue(new Error('down'));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText('把 AI 助手装进这台电脑')).toBeInTheDocument(),
    );
  });
  it('探测中显示状态提示', async () => {
    let resolveProbe: (v: 'ok') => void;
    probeMock.mockReturnValue(
      new Promise<'ok'>((res) => {
        resolveProbe = res;
      }),
    );
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent(
      '正在寻找你电脑上的 agent-compose…',
    );
    await act(async () => {
      resolveProbe!('ok');
    });
  });
  it('在线时 /console/agents 渲染 Agent 列表路由', async () => {
    window.history.replaceState({}, '', '/console/agents');
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() => expect(screen.getByText('AgentListScreen stub')).toBeInTheDocument());
  });
  it('在线时 /console/resources 渲染资源中心', async () => {
    window.history.replaceState({}, '', '/console/resources');
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() => expect(screen.getByText('ResourcesScreen stub')).toBeInTheDocument());
  });
  it('在线时 /console/settings 渲染设置', async () => {
    window.history.replaceState({}, '', '/console/settings');
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() => expect(screen.getByText('SettingsScreen stub')).toBeInTheDocument());
  });
  it('在线时 /console 默认渲染首页 Dashboard', async () => {
    window.history.replaceState({}, '', '/console');
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() => expect(screen.getByText('DashboardScreen stub')).toBeInTheDocument());
  });
  it('在线时 /console/runs 渲染运行记录', async () => {
    window.history.replaceState({}, '', '/console/runs');
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() => expect(screen.getByText('RunsScreen stub')).toBeInTheDocument());
  });
  it('在线时 /console/runs/:runId 渲染运行详情', async () => {
    window.history.replaceState({}, '', '/console/runs/r1');
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() => expect(screen.getByText('RunDetailScreen stub')).toBeInTheDocument());
  });
});
