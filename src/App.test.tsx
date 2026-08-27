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
});
