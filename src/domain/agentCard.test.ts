import { describe, expect, it } from 'vitest';
import { create, type MessageInitShape } from '@bufbuild/protobuf';
import {
  AgentSpecSchema,
  ProjectAgentSchema,
  ProjectSchedulerSchema,
  ProjectSchema,
  ProjectSpecSchema,
  ProjectSummarySchema,
  RunStatus,
  SchedulerSpecSchema,
  TriggerKind,
  TriggerSpecSchema,
  type Project,
  type ProjectAgent,
} from '../api/gen/agentcompose/v2/agentcompose_pb';
import { agentCardStatus, projectToCards, runStatusLabel, describeAgentCardStatus } from './agentCard';

function makeAgent(over: MessageInitShape<typeof ProjectAgentSchema>): ProjectAgent {
  return create(ProjectAgentSchema, {
    projectId: 'p1',
    agentName: 'a1',
    managedAgentId: '',
    provider: 'claude',
    model: '',
    image: '',
    driver: '',
    schedulerEnabled: true,
    enabled: true,
    availability: 0,
    health: 0,
    currentRun: undefined,
    latestRun: undefined,
    displayName: '小助手',
    description: '',
    resolvedModel: '',
    modelSource: 0,
    ...over,
  });
}

describe('agentCardStatus', () => {
  it('运行中（runningRunCount>0）优先 → working', () => {
    const a = makeAgent({ currentRun: { text: '', runningRunCount: 1, runningSchedulerRunCount: 0 } });
    expect(agentCardStatus(a)).toBe('working');
  });
  it('enabled=false → paused', () => {
    expect(agentCardStatus(makeAgent({ enabled: false }))).toBe('paused');
  });
  it('最近一次运行失败 → errored', () => {
    const a = makeAgent({ latestRun: { runId: 'r1', status: RunStatus.FAILED, source: 1, at: undefined } });
    expect(agentCardStatus(a)).toBe('errored');
  });
  it('否则 → idle', () => {
    expect(agentCardStatus(makeAgent({}))).toBe('idle');
  });
  it('描述文案用人话', () => {
    expect(describeAgentCardStatus('working')).toBe('正在工作');
    expect(describeAgentCardStatus('idle')).toBe('待命中');
  });
});

describe('runStatusLabel', () => {
  it('映射运行状态为人话', () => {
    expect(runStatusLabel(RunStatus.RUNNING)).toBe('正在工作');
    expect(runStatusLabel(RunStatus.SUCCEEDED)).toBe('已完成');
    expect(runStatusLabel(RunStatus.FAILED)).toBe('出了点问题');
    expect(runStatusLabel(RunStatus.CANCELED)).toBe('已停止');
  });
});

describe('projectToCards', () => {
  const project: Project = create(ProjectSchema, {
    summary: create(ProjectSummarySchema, {
      projectId: 'p1',
      name: 'proj',
      sourcePath: '',
      currentRevision: 0n,
      specHash: '',
      agentCount: 1,
      schedulerCount: 1,
      runningRunCount: 0,
      latestRunId: '',
      createdAt: undefined,
      updatedAt: undefined,
      removedAt: undefined,
    }),
    spec: undefined,
    agents: [makeAgent({ agentName: 'a1' })],
    schedulers: [
      create(ProjectSchedulerSchema, {
        projectId: 'p1',
        agentName: 'a1',
        schedulerId: 's1',
        enabled: true,
        triggerCount: 1,
        displayName: '',
        description: '',
      }),
    ],
  });
  it('展开 agent 成卡片并携带 nextFireAt', () => {
    const cards = projectToCards(project, (a) => (a.agentName === 'a1' ? new Date('2026-08-30T09:00:00Z') : null));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      key: 'p1:a1',
      projectId: 'p1',
      agentName: 'a1',
      projectName: 'proj',
      displayName: '小助手',
      provider: 'claude',
      status: 'idle',
      schedulerEnabled: true,
      enabled: true,
      prompt: '',
    });
    expect(cards[0].nextFireAt?.toISOString()).toBe('2026-08-30T09:00:00.000Z');
  });
  it('卡片 enabled 来自 ProjectAgent.enabled（暂停真值来源）', () => {
    const p = create(ProjectSchema, { ...project, agents: [makeAgent({ enabled: false })] });
    expect(projectToCards(p, () => null)[0].enabled).toBe(false);
  });
  it('卡片 prompt 读自 spec 的 trigger.prompt（手动任务说明保真）', () => {
    const p = create(ProjectSchema, {
      ...project,
      spec: create(ProjectSpecSchema, {
        name: 'proj',
        agents: [
          create(AgentSpecSchema, {
            name: 'a1',
            scheduler: create(SchedulerSpecSchema, {
              enabled: false,
              triggers: [
                create(TriggerSpecSchema, {
                  name: 'trigger',
                  kind: TriggerKind.INTERVAL,
                  interval: '1h',
                  prompt: '整理今天的新闻要点',
                }),
              ],
            }),
          }),
        ],
      }),
    });
    expect(projectToCards(p, () => null)[0].prompt).toBe('整理今天的新闻要点');
  });
});
