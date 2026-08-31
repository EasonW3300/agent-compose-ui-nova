import { describe, expect, it } from 'vitest';
import { CacheDomain, SandboxStatus } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { DANGEROUS_ACTIONS, describeCacheDomain, describePresetType, describeSandboxStatus, schedulerLevelTone } from './resourceView';

describe('resourceView', () => {
  it('沙箱状态人话化', () => {
    expect(describeSandboxStatus(SandboxStatus.RUNNING)).toBe('运行中');
    expect(describeSandboxStatus(SandboxStatus.PENDING)).toBe('准备中');
    expect(describeSandboxStatus(SandboxStatus.STOPPED)).toBe('已停止');
    expect(describeSandboxStatus(SandboxStatus.FAILED)).toBe('异常');
    expect(describeSandboxStatus(SandboxStatus.UNSPECIFIED)).toBe('未知');
  });
  it('缓存域人话化', () => {
    expect(describeCacheDomain(CacheDomain.OCI_IMAGE_STORE)).toBe('镜像仓库');
    expect(describeCacheDomain(CacheDomain.UNSPECIFIED)).toBe('其他');
  });
  it('调度事件级别 → 色调', () => {
    expect(schedulerLevelTone('error')).toBe('error');
    expect(schedulerLevelTone('warn')).toBe('warn');
    expect(schedulerLevelTone('info')).toBe('info');
    expect(schedulerLevelTone('anything-else')).toBe('info');
  });
  it('预设类型人话化（未知回退原文）', () => {
    expect(describePresetType('empty')).toBe('空工作区');
    expect(describePresetType('git')).toBe('Git 仓库');
    expect(describePresetType('path')).toBe('本地路径');
    expect(describePresetType('custom-thing')).toBe('custom-thing');
  });
  it('危险操作文案齐全（volumes/sandboxes/images/caches/prune）', () => {
    expect(DANGEROUS_ACTIONS.removeVolume).toContain('数据会一起删除');
    expect(DANGEROUS_ACTIONS.pruneVolumes).toContain('未被任何助手使用的数据卷');
    expect(DANGEROUS_ACTIONS.pruneSandboxes).toContain('已停止或异常');
    expect(DANGEROUS_ACTIONS.removeImage).toContain('镜像');
    expect(DANGEROUS_ACTIONS.pruneCaches).toContain('缓存');
  });
});
