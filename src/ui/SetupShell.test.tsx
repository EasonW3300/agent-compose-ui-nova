import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getGlobalEnvMock = vi.fn();
vi.mock('../api/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/settings')>();
  return { ...actual, getGlobalEnv: (...a: unknown[]) => getGlobalEnvMock(...a) };
});

import { SetupShell } from './SetupShell';

describe('SetupShell', () => {
  beforeEach(() => {
    getGlobalEnvMock.mockReset().mockResolvedValue([]);
  });
  it('展示 5 个装机步骤名', () => {
    render(<SetupShell />);
    for (const step of ['欢迎与图解', '环境自检与安装引导', '首次登录', '密钥配置', '完成']) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });
  it('第 0 步展示欢迎内容，「开始安装」进入下一步', async () => {
    const user = userEvent.setup();
    render(<SetupShell />);
    expect(screen.getByRole('heading', { name: '欢迎使用 agent-compose' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '开始安装' }));
    expect(screen.getByRole('heading', { name: '环境自检与安装引导' })).toBeInTheDocument();
  });
  it('第 1 步显示「← 上一步」，点击回到欢迎屏', async () => {
    const user = userEvent.setup();
    render(<SetupShell />);
    await user.click(screen.getByRole('button', { name: '开始安装' }));
    await user.click(screen.getByRole('button', { name: /上一步/ }));
    expect(screen.getByRole('heading', { name: '欢迎使用 agent-compose' })).toBeInTheDocument();
  });
  it('全流程可从欢迎屏一路走到完成屏', async () => {
    const user = userEvent.setup();
    render(<SetupShell />);
    await user.click(screen.getByRole('button', { name: '开始安装' }));
    expect(screen.getByRole('heading', { name: '环境自检与安装引导' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /我已运行安装脚本/ }));
    expect(screen.getByRole('heading', { name: '访问密钥（可选）' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /没有密钥，直接下一步/ }));
    expect(screen.getByRole('heading', { name: '给 AI 引擎填密钥' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /跳过，稍后在设置里配置/ }));
    expect(screen.getByRole('heading', { name: '搞定了！' })).toBeInTheDocument();
  });
});
