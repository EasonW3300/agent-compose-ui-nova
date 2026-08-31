import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { GatewaySection } from './GatewaySection';

const mocks = { getCapabilityGatewayConfig: vi.fn(), updateCapabilityGatewayConfig: vi.fn() };
vi.mock('../api/settings', () => ({
  getCapabilityGatewayConfig: (...a: unknown[]) => mocks.getCapabilityGatewayConfig(...a),
  updateCapabilityGatewayConfig: (...a: unknown[]) => mocks.updateCapabilityGatewayConfig(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

describe('GatewaySection', () => {
  beforeEach(() => {
    mocks.getCapabilityGatewayConfig.mockReset().mockResolvedValue({ addr: 'tcp://127.0.0.1:9000', tokenSet: true });
    mocks.updateCapabilityGatewayConfig.mockReset().mockResolvedValue(undefined);
  });
  it('折叠块默认收起；展开显示 addr 回填', async () => {
    const user = userEvent.setup();
    renderWithClient(<GatewaySection />);
    await waitFor(() => expect(mocks.getCapabilityGatewayConfig).toHaveBeenCalled());
    expect(document.querySelector('details')?.open).toBe(false);
    await user.click(screen.getByText('进阶：能力网关（Capability Gateway）'));
    expect(document.querySelector('details')?.open).toBe(true);
    expect(screen.getByLabelText('网关地址')).toHaveValue('tcp://127.0.0.1:9000');
  });
  it('tokenSet=true 提示「（已配置）」', async () => {
    const user = userEvent.setup();
    renderWithClient(<GatewaySection />);
    await user.click(screen.getByText('进阶：能力网关（Capability Gateway）'));
    await waitFor(() => expect(screen.getByText('（已配置）')).toBeInTheDocument());
  });
  it('保存：token 留空 → token undefined', async () => {
    const user = userEvent.setup();
    renderWithClient(<GatewaySection />);
    await user.click(screen.getByText('进阶：能力网关（Capability Gateway）'));
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() => expect(mocks.updateCapabilityGatewayConfig).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      { addr: 'tcp://127.0.0.1:9000', token: undefined },
    ));
  });
  it('保存：填 token → 一并提交', async () => {
    const user = userEvent.setup();
    renderWithClient(<GatewaySection />);
    await user.click(screen.getByText('进阶：能力网关（Capability Gateway）'));
    await user.type(screen.getByLabelText('访问令牌'), 'sekrit');
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() => expect(mocks.updateCapabilityGatewayConfig).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      { addr: 'tcp://127.0.0.1:9000', token: 'sekrit' },
    ));
  });
  it('保存成功提示「已保存」', async () => {
    const user = userEvent.setup();
    renderWithClient(<GatewaySection />);
    await user.click(screen.getByText('进阶：能力网关（Capability Gateway）'));
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument());
  });
});
