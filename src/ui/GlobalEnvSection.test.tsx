import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { GlobalEnvSection } from './GlobalEnvSection';

const mocks = { getGlobalEnv: vi.fn(), updateGlobalEnv: vi.fn() };
vi.mock('../api/settings', () => ({
  getGlobalEnv: (...a: unknown[]) => mocks.getGlobalEnv(...a),
  updateGlobalEnv: (...a: unknown[]) => mocks.updateGlobalEnv(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

describe('GlobalEnvSection', () => {
  beforeEach(() => {
    mocks.getGlobalEnv.mockReset().mockResolvedValue([
      { name: 'MY_TOKEN', value: 'abc', secret: true },
      { name: 'APP_VER', value: '1.0', secret: false },
    ]);
    mocks.updateGlobalEnv.mockReset().mockResolvedValue(undefined);
  });
  it('渲染两行；secret 行输入框 type=password', async () => {
    renderWithClient(<GlobalEnvSection />);
    await waitFor(() => expect(screen.getAllByLabelText('变量名').length).toBe(2));
    const values = screen.getAllByLabelText('变量值');
    expect(values[0]).toHaveAttribute('type', 'password');
    expect(values[1]).toHaveAttribute('type', 'text');
  });
  it('新增一行 → 保存 → updateGlobalEnv 收到合并后的数组', async () => {
    const user = userEvent.setup();
    renderWithClient(<GlobalEnvSection />);
    await waitFor(() => expect(screen.getByRole('button', { name: '+ 添加' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '+ 添加' }));
    await user.type(screen.getAllByLabelText('变量名')[2], 'NEW_KEY');
    await user.type(screen.getAllByLabelText('变量值')[2], 'x');
    await user.click(screen.getByRole('button', { name: '保存环境变量' }));
    await waitFor(() => expect(mocks.updateGlobalEnv).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      [
        { name: 'MY_TOKEN', secret: true },
        { name: 'APP_VER', value: '1.0', secret: false },
        { name: 'NEW_KEY', value: 'x', secret: false },
      ],
    ));
  });
  it('删除一行 → 保存 → 数组不含该 key', async () => {
    const user = userEvent.setup();
    renderWithClient(<GlobalEnvSection />);
    await waitFor(() => expect(screen.getByRole('button', { name: '删除 MY_TOKEN' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '删除 MY_TOKEN' }));
    await user.click(screen.getByRole('button', { name: '保存环境变量' }));
    await waitFor(() => expect(mocks.updateGlobalEnv).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      [{ name: 'APP_VER', value: '1.0', secret: false }],
    ));
  });
  it('保存后提示「已保存」', async () => {
    const user = userEvent.setup();
    renderWithClient(<GlobalEnvSection />);
    await waitFor(() => expect(screen.getByRole('button', { name: '保存环境变量' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '保存环境变量' }));
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument());
  });
});
