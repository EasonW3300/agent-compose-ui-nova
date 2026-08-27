import { describe, expect, it } from 'vitest';
import { composeToObject, draftToComposeYaml } from './composeYaml';
import type { AgentDraft } from './agentDraft';

const draft: AgentDraft = {
  name: '日报助手',
  displayName: '每日新闻整理员',
  description: '每天汇总新闻',
  provider: 'claude',
  model: 'claude-sonnet-5',
  prompt: '整理今天最重要的三条科技新闻',
  env: [{ key: 'NEWS_LANG', value: 'zh-CN' }],
  schedule: { kind: 'daily', hour: 8, minute: 0 },
  timeoutMinutes: 15,
  workspace: { kind: 'git', url: 'https://github.com/example/notes.git', branch: 'main' },
  volumes: [{ source: '~/news-cache', target: '/workspace/cache', readOnly: false }],
  mcpServers: [
    { name: 'fetcher', type: 'remote', url: 'https://mcp.example.com/fetch' },
  ],
  skills: [{ name: 'summarize', url: 'https://skills.example.com/summarize' }],
  jupyterEnabled: true,
};

describe('composeToObject', () => {
  it('产出顶层 name 与 agents 映射', () => {
    const obj = composeToObject(draft);
    // '日报助手' 不含 ASCII 词法 → slugify 退化为 'assistant'，agents 键同名
    expect(obj.name).toBe('assistant');
    expect(Object.keys((obj as { agents: Record<string, unknown> }).agents)).toEqual([
      'assistant',
    ]);
  });

  it('完整填充 agent 子键', () => {
    const obj = composeToObject(draft) as {
      agents: Record<string, Record<string, unknown>>;
    };
    const agent = obj.agents.assistant;
    expect(agent.display_name).toBe('每日新闻整理员');
    expect(agent.provider).toBe('claude');
    expect(agent.model).toBe('claude-sonnet-5');
    expect(agent.env).toEqual({ NEWS_LANG: 'zh-CN' });
    expect(agent.workspace).toEqual({
      provider: 'git',
      url: 'https://github.com/example/notes.git',
      ref: 'main',
    });
    expect(agent.volumes).toEqual([
      { source: '~/news-cache', target: '/workspace/cache', read_only: false },
    ]);
    expect(agent.mcp_servers).toEqual([
      { name: 'fetcher', type: 'remote', url: 'https://mcp.example.com/fetch' },
    ]);
    expect(agent.skills).toEqual([{ name: 'summarize', url: 'https://skills.example.com/summarize' }]);
    expect(agent.jupyter).toEqual({ enabled: true });
    expect(agent.scheduler).toEqual({
      triggers: [{ name: 'trigger', cron: '0 8 * * *', timeout: '15m', prompt: draft.prompt }],
    });
  });

  it('manual 触发且无可选段时不输出多余键', () => {
    const obj = composeToObject({
      ...draft,
      name: 'quick',
      schedule: { kind: 'manual' },
      timeoutMinutes: undefined,
      jupyterEnabled: false,
    }) as { agents: Record<string, Record<string, unknown>> };
    expect(obj.agents.quick.scheduler).toBeUndefined();
    expect(obj.agents.quick.jupyter).toBeUndefined();
  });
});

describe('draftToComposeYaml', () => {
  it('输出可直接粘贴到 agent-compose.yml 的文本', () => {
    const text = draftToComposeYaml(draft);
    expect(text.startsWith('name: assistant')).toBe(true);
    expect(text).toContain('agents:');
    expect(text).toContain('provider: claude');
    expect(text).toContain('prompt: 整理今天最重要的三条科技新闻');
  });
});
