import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from './LoginScreen';

const checkAccessMock = vi.fn();
vi.mock('../api/connection', async (orig) => {
  const actual = await orig<typeof import('../api/connection')>();
  return {
    ...actual,
    loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }),
    saveConnectionSettings: () => {},
    checkAccess: (...a: unknown[]) => checkAccessMock(...a),
  };
});

describe('LoginScreen', () => {
  it('填入密钥并「保存并继续」，校验通过则进入下一步', async () => {
    const user = userEvent.setup();
    checkAccessMock.mockResolvedValue('ok');
    const onNext = vi.fn();
    render(<LoginScreen onNext={onNext} />);
    await user.type(screen.getByLabelText('访问密钥'), 'my-token');
    await user.click(screen.getByRole('button', { name: /保存并继续/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('密钥已保存');
    expect(onNext).toHaveBeenCalled();
  });
  it('密钥不正确时给出错误提示且不前进', async () => {
    const user = userEvent.setup();
    checkAccessMock.mockResolvedValue('invalid');
    const onNext = vi.fn();
    render(<LoginScreen onNext={onNext} />);
    await user.type(screen.getByLabelText('访问密钥'), 'wrong');
    await user.click(screen.getByRole('button', { name: /保存并继续/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('密钥不正确');
    expect(onNext).not.toHaveBeenCalled();
  });
  it('连不上时提示已保存并可继续', async () => {
    const user = userEvent.setup();
    checkAccessMock.mockResolvedValue('unreachable');
    const onNext = vi.fn();
    render(<LoginScreen onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: /保存并继续/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时连不上 agent-compose');
    expect(onNext).toHaveBeenCalled();
  });
  it('「没有密钥，直接下一步」直接前进', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<LoginScreen onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: /没有密钥，直接下一步/ }));
    expect(onNext).toHaveBeenCalled();
  });
});
