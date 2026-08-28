import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallGuideScreen } from './InstallGuideScreen';

afterEach(() => vi.unstubAllGlobals());

describe('InstallGuideScreen', () => {
  it('Linux 环境展示安装命令并支持一键复制', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...window.navigator, userAgent: 'X11; Linux x86_64', platform: 'Linux x86_64', clipboard: { writeText } });
    const onNext = vi.fn();
    render(<InstallGuideScreen onNext={onNext} />);
    expect(screen.getByText(/curl -fsSL/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '复制命令' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('install.sh'));
    await user.click(screen.getByRole('button', { name: /我已运行安装脚本/ }));
    expect(onNext).toHaveBeenCalled();
  });
});
