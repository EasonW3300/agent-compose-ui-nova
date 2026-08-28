import type { HostOS } from './os';

export interface InstallStep {
  kind: 'text' | 'command' | 'link';
  text?: string;
  code?: string;
  href?: string;
}

export const LINUX_INSTALL_COMMAND =
  'curl -fsSL https://github.com/chaitin/agent-compose/releases/download/installer-latest/install.sh | bash';
export const DOCKER_DESKTOP_URL = 'https://www.docker.com/products/docker-desktop/';
export const UPSTREAM_DOCS_URL = 'https://github.com/chaitin/agent-compose#readme';

export const OS_LABEL: Record<HostOS, string> = {
  macos: 'macOS',
  linux: 'Linux',
  windows: 'Windows',
  unsupported: '未知系统',
};

export function installPlanFor(os: HostOS): InstallStep[] {
  switch (os) {
    case 'linux':
      return [
        { kind: 'text', text: '在「终端」里粘贴下面这行命令并回车（提示密码时输入电脑密码即可）：' },
        { kind: 'command', code: LINUX_INSTALL_COMMAND },
        { kind: 'text', text: '脚本跑完后会提示访问密钥；把它记下来，下一步可能会用到。' },
      ];
    case 'macos':
      return [
        { kind: 'text', text: '第一步：安装 Docker Desktop（免费，装完打开一次）' },
        { kind: 'link', text: '打开 Docker Desktop 下载页', href: DOCKER_DESKTOP_URL },
        { kind: 'text', text: '第二步：打开 Docker Desktop 等它显示 running，再按官方文档完成 agent-compose 安装。' },
        { kind: 'link', text: '查看官方安装文档', href: UPSTREAM_DOCS_URL },
      ];
    case 'windows':
      return [
        { kind: 'text', text: 'agent-compose 目前需要 Linux 或 macOS 环境。Windows 用户请安装 WSL2 里的 Ubuntu，再按 Linux 步骤安装。' },
      ];
    case 'unsupported':
      return [
        { kind: 'text', text: '没能识别你的系统。可以手动打开官方文档，里面有各平台的安装说明。' },
        { kind: 'link', text: '查看官方安装文档', href: UPSTREAM_DOCS_URL },
      ];
  }
}
