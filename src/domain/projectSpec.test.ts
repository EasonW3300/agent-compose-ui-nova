import { describe, expect, it } from 'vitest';
import { TriggerKind } from '../api/gen/agentcompose/v2/agentcompose_pb';
import type { AgentDraft } from './agentDraft';
import {
  draftToProjectSpec,
  projectSpecToDraft,
  parseCronToSchedule,
  parseIntervalToMinutes,
  timeoutToMinutes,
  issuePathToStep,
} from './projectSpec';

const base: AgentDraft = {
  name: 'My Daily Bot',
  displayName: '我的每日小助手',
  description: '每天整理一次',
  provider: 'codex',
  model: 'gpt-5',
  prompt: '整理今日待办',
  systemPrompt: '你是一个整理助手',
  env: [{ key: 'TZ', value: 'Asia/Shanghai' }],
  schedule: { kind: 'daily', hour: 9, minute: 30 },
  timeoutMinutes: 90,
  workspace: { kind: 'git', url: 'https://github.com/x/y.git', branch: 'main' },
  volumes: [{ source: 'data', target: '/work/data', readOnly: true }],
  mcpServers: [{ name: 'web', type: 'remote', url: 'https://mcp.example.com' }],
  skills: [{ name: 'reporter', url: 'https://skills.example.com/reporter' }],
  jupyterEnabled: true,
};

describe('draftToProjectSpec', () => {
  it('把草稿映射成 ProjectSpec（项目名与 agent 名用 slugify）', () => {
    const spec = draftToProjectSpec(base);
    expect(spec.name).toBe('my-daily-bot');
    const agent = spec.agents[0];
    expect(agent.name).toBe('my-daily-bot');
    expect(agent.displayName).toBe('我的每日小助手');
    expect(agent.provider).toBe('codex');
    expect(agent.model).toBe('gpt-5');
    expect(agent.systemPrompt).toBe('你是一个整理助手');
    expect(agent.enabled).toBe(true);
  });
  it('env/volumes/mcp/skills/jupyter 逐项映射', () => {
    const agent = draftToProjectSpec(base).agents[0];
    expect(agent.env).toMatchObject([{ name: 'TZ', value: 'Asia/Shanghai', secret: false }]);
    expect(agent.volumes).toMatchObject([{ type: 0, source: 'data', target: '/work/data', readOnly: true }]);
    expect(agent.mcpServers[0]).toMatchObject({ name: 'web', type: 'remote', url: 'https://mcp.example.com' });
    expect(agent.skills[0]).toMatchObject({ name: 'reporter' });
    expect(agent.jupyter).toBeTruthy();
  });
  it('git 工作区映射 provider=git + ref；file 工作区映射 provider=file', () => {
    const g = draftToProjectSpec(base).agents[0];
    expect(g.workspace).toMatchObject({ provider: 'git', url: 'https://github.com/x/y.git', ref: 'main' });
    const local: AgentDraft = { ...base, workspace: { kind: 'local', path: '/tmp/w' } };
    expect(draftToProjectSpec(local).agents[0].workspace).toMatchObject({ provider: 'file', path: '/tmp/w' });
  });
  it('daily/weekly/interval 三种调度映射成 cron/interval trigger + prompt + timeout', () => {
    const daily = draftToProjectSpec(base).agents[0].scheduler!;
    expect(daily.enabled).toBe(true);
    expect(daily.triggers[0]).toMatchObject({ name: 'trigger', cron: '30 9 * * *', timeout: '90m', prompt: '整理今日待办' });
    const weekly: AgentDraft = { ...base, schedule: { kind: 'weekly', days: [1, 3], hour: 8, minute: 0 } };
    expect(draftToProjectSpec(weekly).agents[0].scheduler!.triggers[0].cron).toBe('0 8 * * 1,3');
    const interval: AgentDraft = { ...base, schedule: { kind: 'interval', minutes: 90 } };
    const itrig = draftToProjectSpec(interval).agents[0].scheduler!.triggers[0];
    expect(itrig.interval).toBe('1h30m');
    expect(itrig.cron).toBe('');
  });
  it('手动调度产出禁用调度器，只背着任务说明（prompt）', () => {
    const manual: AgentDraft = { ...base, schedule: { kind: 'manual' } };
    const agent = draftToProjectSpec(manual).agents[0];
    expect(agent.scheduler).toBeDefined();
    expect(agent.scheduler!.enabled).toBe(false);
    expect(agent.scheduler!.triggers[0]).toMatchObject({
      kind: TriggerKind.INTERVAL,
      prompt: '整理今日待办',
    });
  });
  it('name 为空时用 displayName 兜底', () => {
    const d: AgentDraft = { ...base, name: '', displayName: 'My Bot' };
    const spec = draftToProjectSpec(d);
    expect(spec.name).toBe('my-bot');
    expect(spec.agents[0].name).toBe('my-bot');
  });
});

describe('projectSpecToDraft', () => {
  it('把 ProjectSpec 反解回 AgentDraft（编辑回填用）', () => {
    const spec = draftToProjectSpec(base);
    const draft = projectSpecToDraft(spec, 'my-daily-bot');
    expect(draft.displayName).toBe('我的每日小助手');
    expect(draft.provider).toBe('codex');
    expect(draft.prompt).toBe('整理今日待办');
    expect(draft.timeoutMinutes).toBe(90);
    expect(draft.env).toEqual([{ key: 'TZ', value: 'Asia/Shanghai' }]);
    expect(draft.workspace).toEqual({ kind: 'git', url: 'https://github.com/x/y.git', branch: 'main' });
    expect(draft.schedule).toEqual({ kind: 'daily', hour: 9, minute: 30 });
    expect(draft.jupyterEnabled).toBe(true);
  });
  it('agent 不存在时抛错', () => {
    const spec = draftToProjectSpec(base);
    expect(() => projectSpecToDraft(spec, 'nope')).toThrow(/not found/);
  });
  it('手动调度草稿的 prompt 经 序列化→反解 原样保真（schedule 仍是 manual）', () => {
    const manual: AgentDraft = { ...base, name: 'Manual Bot', displayName: '手动助手', schedule: { kind: 'manual' } };
    const spec = draftToProjectSpec(manual);
    const draft = projectSpecToDraft(spec, 'manual-bot');
    expect(draft.schedule).toEqual({ kind: 'manual' });
    expect(draft.prompt).toBe('整理今日待办');
    expect(draft.displayName).toBe('手动助手');
  });
});

describe('cron/interval 解析', () => {
  it('parseCronToSchedule 支持 daily 与 weekly', () => {
    expect(parseCronToSchedule('30 9 * * *')).toEqual({ kind: 'daily', hour: 9, minute: 30 });
    expect(parseCronToSchedule('0 8 * * 1,3')).toEqual({ kind: 'weekly', days: [1, 3], hour: 8, minute: 0 });
  });
  it('parseIntervalToMinutes 支持 h/m 组合', () => {
    expect(parseIntervalToMinutes('1h30m')).toBe(90);
    expect(parseIntervalToMinutes('45m')).toBe(45);
    expect(parseIntervalToMinutes('2h')).toBe(120);
  });
  it('timeoutToMinutes 只认纯分钟', () => {
    expect(timeoutToMinutes('90m')).toBe(90);
    expect(timeoutToMinutes(undefined)).toBeUndefined();
    expect(timeoutToMinutes('')).toBeUndefined();
  });
  it('issuePathToStep 把校验路径映射回步骤', () => {
    expect(issuePathToStep('agents.0.provider')).toBe(0);
    expect(issuePathToStep('agents.0.system_prompt')).toBe(1);
    expect(issuePathToStep('agents.0.scheduler.triggers.0.cron')).toBe(2);
    expect(issuePathToStep('agents.0.workspace')).toBe(3);
    expect(issuePathToStep('name')).toBe(4);
    expect(issuePathToStep('agents.1.provider')).toBe(0);
  });
});
