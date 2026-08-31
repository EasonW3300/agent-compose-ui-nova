import { CacheDomain, SandboxStatus } from '../api/gen/agentcompose/v2/agentcompose_pb';

export function describeSandboxStatus(status: SandboxStatus): string {
  switch (status) {
    case SandboxStatus.PENDING: return '准备中';
    case SandboxStatus.RUNNING: return '运行中';
    case SandboxStatus.STOPPED: return '已停止';
    case SandboxStatus.FAILED: return '异常';
    default: return '未知';
  }
}

export function describeCacheDomain(domain: CacheDomain): string {
  switch (domain) {
    case CacheDomain.OCI_IMAGE_STORE: return '镜像仓库';
    case CacheDomain.MATERIALIZED_IMAGE_CACHE: return '镜像缓存';
    default: return '其他';
  }
}

export function schedulerLevelTone(level: string): 'info' | 'warn' | 'error' {
  if (level === 'error') return 'error';
  if (level === 'warn' || level === 'warning') return 'warn';
  return 'info';
}

export function describePresetType(type: string): string {
  switch (type) {
    case 'empty': return '空工作区';
    case 'git': return 'Git 仓库';
    case 'path': return '本地路径';
    default: return type;
  }
}

/** 危险操作二次确认文案：键为操作 id，值为人话后果。 */
export const DANGEROUS_ACTIONS: Record<string, string> = {
  removePreset: '删除后，这个工作区预设会从列表移除，向导里不再可选。',
  removeVolume: '删除后，这个数据卷里的数据会一起删除，无法恢复。',
  pruneVolumes: '会清理所有未被任何助手使用的数据卷，释放磁盘空间。',
  removeSandbox: '删除后，这个助手的工作台会被移除，无法恢复。',
  pruneSandboxes: '会清理所有已停止或异常的工作台，释放磁盘空间。',
  removeImage: '删除后，这个镜像会在本地被移除，下次用到时要重新拉取。',
  removeCache: '删除后，这份缓存会被清理，下次运行可能变慢。',
  pruneCaches: '会清理所有未使用的缓存，释放磁盘空间。',
};
