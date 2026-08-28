import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WizardStepBar } from './WizardStepBar';
import { CREATE_STEPS } from './createWizardSteps';

describe('WizardStepBar', () => {
  it('渲染 5 步、当前步 aria-current=step、未来步禁用', () => {
    render(<WizardStepBar steps={CREATE_STEPS} currentStep={2} onStepClick={vi.fn()} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('AI 引擎')).toBeInTheDocument();
    expect(screen.getByText('确认创建')).toBeInTheDocument();
    const current = screen.getByRole('button', { name: /什么时候干活/ });
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: /确认创建/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /AI 引擎/ })).not.toBeDisabled();
  });
  it('点击已访问步触发回调', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<WizardStepBar steps={CREATE_STEPS} currentStep={3} onStepClick={onClick} />);
    await user.click(screen.getByRole('button', { name: /任务说明/ }));
    expect(onClick).toHaveBeenCalledWith(1);
  });
});
