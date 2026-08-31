import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { ResourcesScreen } from './ResourcesScreen';

vi.mock('./PresetsTab', () => ({ PresetsTab: () => <div>presets tab</div> }));
vi.mock('./VolumesTab', () => ({ VolumesTab: () => <div>volumes tab</div> }));
vi.mock('./PluginLibraryTab', () => ({ PluginLibraryTab: () => <div>plugins tab</div> }));
vi.mock('./SandboxesTab', () => ({ SandboxesTab: () => <div>sandboxes tab</div> }));

describe('ResourcesScreen', () => {
  it('默认渲染工作区预设 Tab', () => {
    renderWithClient(<ResourcesScreen />);
    expect(screen.getByText('presets tab')).toBeInTheDocument();
  });
  it('点击 Tab 切换', async () => {
    const user = userEvent.setup();
    renderWithClient(<ResourcesScreen />);
    await user.click(screen.getByRole('tab', { name: '数据卷' }));
    expect(screen.getByText('volumes tab')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '插件库' }));
    expect(screen.getByText('plugins tab')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '沙箱与镜像' }));
    expect(screen.getByText('sandboxes tab')).toBeInTheDocument();
  });
});
