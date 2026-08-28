import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UNAUTHORIZED_EVENT } from '../api/connection';
import { renderWithClient } from '../test/renderWithClient';
import { AuthOverlay } from './AuthOverlay';

const checkAccessMock = vi.fn();
const saveConnectionSettingsMock = vi.fn();
const loadConnectionSettingsMock = vi.fn();

vi.mock('../api/connection', () => ({
  UNAUTHORIZED_EVENT: 'acnova:unauthorized',
  checkAccess: (...a: unknown[]) => checkAccessMock(...a),
  saveConnectionSettings: (...a: unknown[]) => saveConnectionSettingsMock(...a),
  loadConnectionSettings: () => loadConnectionSettingsMock(),
}));

describe('AuthOverlay', () => {
  beforeEach(() => {
    checkAccessMock.mockReset();
    saveConnectionSettingsMock.mockReset();
    loadConnectionSettingsMock.mockReset().mockReturnValue({ baseUrl: '', authToken: '' });
  });
  it('默认不渲染', () => {
    renderWithClient(<AuthOverlay />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('收到 acnova:unauthorized 后弹出登录浮层', () => {
    renderWithClient(<AuthOverlay />);
    act(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    });
    expect(screen.getByRole('dialog', { name: '访问密钥失效' })).toBeInTheDocument();
  });
  it('输入正确密钥并保存后关闭', async () => {
    const user = userEvent.setup();
    checkAccessMock.mockResolvedValue('ok');
    renderWithClient(<AuthOverlay />);
    act(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    });
    await user.type(screen.getByLabelText('访问密钥'), 'secret');
    await user.click(screen.getByRole('button', { name: /保存并重新连接/ }));
    expect(saveConnectionSettingsMock).toHaveBeenCalledWith({ baseUrl: '', authToken: 'secret' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('密钥错误给人话提示', async () => {
    const user = userEvent.setup();
    checkAccessMock.mockResolvedValue('invalid');
    renderWithClient(<AuthOverlay />);
    act(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    });
    await user.type(screen.getByLabelText('访问密钥'), 'bad');
    await user.click(screen.getByRole('button', { name: /保存并重新连接/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/密钥不正确/);
  });
  it('取消可关闭浮层', async () => {
    const user = userEvent.setup();
    renderWithClient(<AuthOverlay />);
    act(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    });
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
