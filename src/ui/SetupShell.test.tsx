import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupShell } from './SetupShell';

describe('SetupShell', () => {
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
});
