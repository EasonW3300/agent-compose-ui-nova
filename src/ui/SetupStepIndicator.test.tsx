import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupStepIndicator } from './SetupStepIndicator';

describe('SetupStepIndicator', () => {
  const names = ['欢迎与图解', '环境自检与安装引导', '首次登录', '密钥配置', '完成'];
  it('渲染全部 5 个步骤名，当前步带 aria-current', () => {
    render(<SetupStepIndicator currentStep={2} onStepClick={() => {}} />);
    for (const name of names) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /首次登录/ })).toHaveAttribute('aria-current', 'step');
  });
  it('点击已访问步触发 onStepClick；未来步按钮禁用', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SetupStepIndicator currentStep={1} onStepClick={onClick} />);
    await user.click(screen.getByRole('button', { name: /欢迎与图解/ }));
    expect(onClick).toHaveBeenCalledWith(0);
    expect(screen.getByRole('button', { name: /密钥配置/ })).toBeDisabled();
  });
});
