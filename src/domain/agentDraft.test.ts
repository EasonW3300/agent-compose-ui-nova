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
  it('全非法输入退化为确定性唯一的 assistant-<hash>', () => {
    expect(slugify('###')).toBe('assistant-874c6e');
  });
  it('不同中文名产出不同 slug（不再全部撞成 assistant）', () => {
    const a = slugify('日报助手');
    const b = slugify('周报助手');
    const c = slugify('每日新闻整理员');
    expect(a).toMatch(/^assistant-[0-9a-f]{6}$/);
    expect(b).toMatch(/^assistant-[0-9a-f]{6}$/);
    expect(c).toMatch(/^assistant-[0-9a-f]{6}$/);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
  });
  it('同一中文名哈希稳定（编辑回填可复现同一 slug）', () => {
    expect(slugify('日报助手')).toBe('assistant-eb9143');
    expect(slugify('日报助手')).toBe(slugify('日报助手'));
  });
  it('拉丁 slug 再 slugify 保持原样（幂等）', () => {
    const slug = slugify('My Report');
    expect(slugify(slug)).toBe(slug);
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
