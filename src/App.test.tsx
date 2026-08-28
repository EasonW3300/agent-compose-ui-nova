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
  it('在线时 /console/settings 渲染占位页', async () => {
    window.history.replaceState({}, '', '/console/settings');
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() => expect(screen.getByText('设置（下个阶段）')).toBeInTheDocument());
  });
});
