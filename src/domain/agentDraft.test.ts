import { describe, expect, it } from 'vitest';
import { slugify, buildTriggers, type AgentDraft } from './agentDraft';

const baseDraft: AgentDraft = {
  name: '日报助手',
  displayName: '日报助手',
  provider: 'claude',
  prompt: '帮我整理今天的新闻要点',
  schedule: { kind: 'manual' },
  workspace: { kind: 'none' },
  jupyterEnabled: false,
  volumes: [],
  mcpServers: [],
  skills: [],
  env: [],
};

describe('slugify', () => {
  it('中文与小写转换', () => {
    expect(slugify('My Report')).toBe('my-report');
  });
  it('非法字符折叠为连字符，前后分隔符被修剪', () => {
    expect(slugify('  Daily 报告!!  ')).toBe('daily');
  });
  it('全非法输入退化为 "assistant"', () => {
    expect(slugify('###')).toBe('assistant');
  });
});

describe('buildTriggers', () => {
  it('manual -> null', () => {
    expect(buildTriggers({ kind: 'manual' })).toBeNull();
  });
  it('daily -> 单条 cron 触发器', () => {
    expect(buildTriggers({ kind: 'daily', hour: 8, minute: 0 })).toEqual([
      { name: 'trigger', cron: '0 8 * * *' },
    ]);
  });
  it('interval -> interval 字符串（90 分钟 -> 1h30m）', () => {
    expect(buildTriggers({ kind: 'interval', minutes: 90 })).toEqual([
      { name: 'trigger', interval: '1h30m' },
    ]);
  });
  it('timeoutMinutes 附着到触发器', () => {
    expect(buildTriggers({ kind: 'daily', hour: 9, minute: 0 }, 15)?.[0]).toMatchObject({
      cron: '0 9 * * *',
      timeout: '15m',
    });
  });
});

describe('AgentDraft 基础形状', () => {
  it('baseDraft 满足类型约束（编译期验证）', () => {
    expect(baseDraft.provider).toBe('claude');
    expect(baseDraft.schedule.kind).toBe('manual');
  });
});
