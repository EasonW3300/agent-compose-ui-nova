import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderKeysScreen } from './ProviderKeysScreen';

const getGlobalEnvMock = vi.fn();
const updateGlobalEnvMock = vi.fn();
vi.mock('../api/settings', async (orig) => {
  const actual = await orig<typeof import('../api/settings')>();
  return { ...actual, getGlobalEnv: (...a: unknown[]) => getGlobalEnvMock(...a), updateGlobalEnv: (...a: unknown[]) => updateGlobalEnvMock(...a) };
});
vi.mock('../api/connection', async (orig) => {
  const actual = await orig<typeof import('../api/connection')>();
  return { ...actual, loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) };
});

describe('ProviderKeysScreen', () => {
  beforeEach(() => {
    getGlobalEnvMock.mockReset().mockResolvedValue([{ name: 'ANTHROPIC_API_KEY', value: 'redacted', secret: true }]);
    updateGlobalEnvMock.mockReset().mockResolvedValue([]);
  });
  it('渲染 4 张引擎卡，claude 显示已配置徽章', async () => {
    render(<ProviderKeysScreen onNext={() => {}} />);
    expect(await screen.findByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Codex')).toBeInTheDocument();
    expect(screen.getByText('Pi')).toBeInTheDocument();
    expect(screen.getByText('DSH')).toBeInTheDocument();
    expect(screen.getAllByText('已配置')).toHaveLength(1);
  });
  it('填入密钥并保存：以整体替换语义调用 updateGlobalEnv', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<ProviderKeysScreen onNext={onNext} />);
    await user.type(await screen.findByLabelText('Codex 密钥'), 'sk-oa');
    await user.click(screen.getByRole('button', { name: /保存密钥/ }));
    await waitFor(() => expect(updateGlobalEnvMock).toHaveBeenCalledTimes(1));
    const payload = updateGlobalEnvMock.mock.calls[0][1];
    expect(payload).toEqual(expect.arrayContaining([{ name: 'ANTHROPIC_API_KEY', secret: true }]));
    expect(payload).toEqual(expect.arrayContaining([{ name: 'OPENAI_API_KEY', value: 'sk-oa', secret: true }]));
    expect(onNext).not.toHaveBeenCalled(); // 保存后仍在当前页
  });
  it('「跳过，稍后在设置里配置」直接前进', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<ProviderKeysScreen onNext={onNext} />);
    await user.click(await screen.findByRole('button', { name: /跳过，稍后在设置里配置/ }));
    expect(onNext).toHaveBeenCalled();
  });
});
