import { describe, expect, it } from 'vitest';
import { installPlanFor, LINUX_INSTALL_COMMAND } from './install';

describe('installPlanFor', () => {
  it('Linux 给出官方安装脚本命令', () => {
    const plan = installPlanFor('linux');
    expect(plan.some((s) => s.kind === 'command' && s.code === LINUX_INSTALL_COMMAND)).toBe(true);
  });
  it('macOS 引导安装 Docker Desktop 并提供文档链接', () => {
    const plan = installPlanFor('macos');
    expect(plan.some((s) => s.kind === 'link' && s.href?.includes('docker.com'))).toBe(true);
  });
  it('Windows 说明使用 WSL2 按 Linux 步骤', () => {
    const plan = installPlanFor('windows');
    expect(plan.some((s) => s.text?.includes('WSL'))).toBe(true);
  });
});
