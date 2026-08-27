import { describe, expect, it } from 'vitest';
import { PROVIDERS, describeRunStatus, TERMS } from './labels';

describe('PROVIDERS', () => {
  it('只含四个引擎且有序', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['claude', 'codex', 'pi', 'dsh']);
  });
  it('每个引擎有中文名与一句话定位', () => {
    for (const p of PROVIDERS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.tagline.length).toBeGreaterThan(0);
      expect(p.scenarios.length).toBeGreaterThan(0);
    }
  });
  it('claude 的展示名是 Claude Code', () => {
    expect(PROVIDERS.find((p) => p.id === 'claude')!.label).toBe('Claude Code');
  });
});

describe('describeRunStatus', () => {
  it('翻译各状态为人话', () => {
    expect(describeRunStatus('running')).toBe('正在工作');
    expect(describeRunStatus('succeeded')).toBe('已完成');
    expect(describeRunStatus('failed')).toBe('出了点问题');
    expect(describeRunStatus('stopped')).toBe('已停止');
    expect(describeRunStatus('unknown')).toBe('未知');
  });
});

describe('TERMS', () => {
  it('覆盖核心转译词', () => {
    expect(TERMS.agent).toBe('AI 助手');
    expect(TERMS.provider).toBe('AI 引擎');
    expect(TERMS.volume).toBe('数据文件夹');
    expect(TERMS.mcp_server).toBe('插件');
    expect(TERMS.skill).toBe('技能包');
  });
});
