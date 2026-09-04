import { create } from '@bufbuild/protobuf';
import type { AgentDraft, WorkspaceDraft, VolumeMountDraft, McpServerDraft, SkillDraft } from './agentDraft';
import { slugify } from './agentDraft';
import { buildCronExpr, buildIntervalString, type ScheduleInput } from './schedule';
import type { ProviderId } from './labels';
import {
  AgentSpecSchema,
  EnvVarSpecSchema,
  JupyterSpecSchema,
  MCPServerSpecSchema,
  ProjectSpecSchema,
  SchedulerSpecSchema,
  SkillSpecSchema,
  TriggerSpecSchema,
  VolumeMountSpecSchema,
  WorkspaceSpecSchema,
  type MCPServerSpec,
  type ProjectSpec,
  type SchedulerSpec,
  type SkillSpec,
  type TriggerSpec,
  type VolumeMountSpec,
  type WorkspaceSpec,
} from '../api/gen/agentcompose/v2/agentcompose_pb';

const PROVIDER_IDS: readonly ProviderId[] = ['claude', 'codex', 'pi', 'dsh'];
function isProviderId(v: string): v is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(v);
}

/** AgentDraft → ProjectSpec（单 agent 项目；项目名与 agent 名同用 slugify(displayName)）。 */
export function draftToProjectSpec(draft: AgentDraft): ProjectSpec {
  const name = slugify(draft.name || draft.displayName);
  const agent = create(AgentSpecSchema, {
    name,
    provider: draft.provider,
    model: draft.model ?? '',
    systemPrompt: draft.systemPrompt ?? '',
    displayName: draft.displayName,
    description: draft.description ?? '',
    enabled: true,
    env: draft.env.map((e) => create(EnvVarSpecSchema, { name: e.key, value: e.value })),
    workspace: draftWorkspaceToSpec(draft.workspace),
    scheduler: draftSchedulerToSpec(draft),
    volumes: draft.volumes.map(draftVolumeToSpec),
    mcpServers: draft.mcpServers.map(draftMcpToSpec),
    skills: draft.skills.map(draftSkillToSpec),
    jupyter: draft.jupyterEnabled ? create(JupyterSpecSchema, { enabled: true }) : undefined,
  });
  return create(ProjectSpecSchema, { name, agents: [agent] });
}

function draftWorkspaceToSpec(w: WorkspaceDraft): WorkspaceSpec | undefined {
  if (w.kind === 'none') return undefined;
  if (w.kind === 'local') return create(WorkspaceSpecSchema, { provider: 'file', path: w.path });
  return create(WorkspaceSpecSchema, {
    provider: 'git',
    url: w.url,
    ...(w.branch ? { ref: w.branch } : {}),
  });
}

function draftSchedulerToSpec(draft: AgentDraft): SchedulerSpec | undefined {
  if (draft.schedule.kind === 'manual') {
    // 手动触发没有调度，但任务说明（prompt）在 proto 里只挂在 TriggerSpec.prompt 上，
    // AgentSpec/ProjectAgent 都没有 prompt 字段。用一个禁用掉的 interval 触发器背着 prompt：
    // enabled=false 永不触发，仅作为 prompt 的持久化载体（编辑回填时能原样读回）。
    // 触发器类型由 interval 字段推断；不要传 kind 枚举，否则当前服务端会把其文本值当未知字段。
    return create(SchedulerSpecSchema, {
      enabled: false,
      triggers: [
        create(TriggerSpecSchema, {
          name: 'trigger',
          interval: buildIntervalString(60),
          prompt: draft.prompt,
        }),
      ],
    });
  }
  const timeout = draft.timeoutMinutes ? { timeout: `${draft.timeoutMinutes}m` } : {};
  const trigger =
    draft.schedule.kind === 'interval'
      ? create(TriggerSpecSchema, {
          name: 'trigger',
          interval: buildIntervalString(draft.schedule.minutes),
          prompt: draft.prompt,
          ...timeout,
        })
      : create(TriggerSpecSchema, {
          name: 'trigger',
          cron: buildCronExpr(draft.schedule),
          prompt: draft.prompt,
          ...timeout,
        });
  return create(SchedulerSpecSchema, { enabled: true, triggers: [trigger] });
}

function draftVolumeToSpec(v: VolumeMountDraft): VolumeMountSpec {
  return create(VolumeMountSpecSchema, { source: v.source, target: v.target, readOnly: v.readOnly });
}

function draftMcpToSpec(m: McpServerDraft): MCPServerSpec {
  return create(MCPServerSpecSchema, {
    name: m.name,
    type: m.type,
    ...(m.command ? { command: m.command } : {}),
    ...(m.args && m.args.length > 0 ? { args: m.args } : {}),
    ...(m.url ? { url: m.url } : {}),
  });
}

function draftSkillToSpec(k: SkillDraft): SkillSpec {
  return create(SkillSpecSchema, {
    name: k.name,
    ...(k.url ? { url: k.url } : {}),
    ...(k.ref ? { ref: k.ref } : {}),
  });
}

/** ProjectSpec → AgentDraft（编辑回填：找 agentName 对应 agent）。 */
export function projectSpecToDraft(spec: ProjectSpec, agentName: string): AgentDraft {
  const agent = spec.agents.find((a) => a.name === agentName);
  if (!agent) throw new Error(`AgentSpec '${agentName}' not found in project '${spec.name}'`);
  const trigger = agent.scheduler?.triggers[0];
  return {
    name: spec.name,
    displayName: agent.displayName || agent.name,
    description: agent.description || undefined,
    provider: isProviderId(agent.provider) ? agent.provider : 'claude',
    model: agent.model || undefined,
    prompt: trigger?.prompt ?? '',
    systemPrompt: agent.systemPrompt || undefined,
    env: agent.env.map((e) => ({ key: e.name, value: e.value })),
    // 禁用掉的调度器（手动草稿的 prompt 载体）读回成 manual，别被 interval 触发器带偏成定时调度。
    schedule: agent.scheduler && !agent.scheduler.enabled ? { kind: 'manual' } : triggerToSchedule(trigger),
    timeoutMinutes: timeoutToMinutes(trigger?.timeout),
    workspace: specWorkspaceToDraft(agent.workspace),
    volumes: agent.volumes.map((v) => ({ source: v.source, target: v.target, readOnly: v.readOnly })),
    mcpServers: agent.mcpServers.map((m) => ({
      name: m.name,
      type: m.type === 'local' ? 'local' : 'remote',
      ...(m.command ? { command: m.command } : {}),
      ...(m.args && m.args.length > 0 ? { args: m.args } : {}),
      ...(m.url ? { url: m.url } : {}),
    })),
    skills: agent.skills.map((k) => ({
      name: k.name,
      ...(k.url ? { url: k.url } : {}),
      ...(k.ref ? { ref: k.ref } : {}),
    })),
    jupyterEnabled: !!agent.jupyter?.enabled,
  };
}

function triggerToSchedule(trigger?: TriggerSpec): ScheduleInput {
  if (!trigger) return { kind: 'manual' };
  // 服务端以实际的 cron / interval 字段表达触发器类型；同时兼容未返回 kind 的项目配置。
  if (trigger.interval) {
    return { kind: 'interval', minutes: parseIntervalToMinutes(trigger.interval) };
  }
  if (trigger.cron) {
    return parseCronToSchedule(trigger.cron);
  }
  return { kind: 'manual' };
}

function specWorkspaceToDraft(w?: WorkspaceSpec): WorkspaceDraft {
  if (!w) return { kind: 'none' };
  if (w.provider === 'git') return { kind: 'git', url: w.url, ...(w.ref ? { branch: w.ref } : {}) };
  if (w.provider === 'file' && w.path) return { kind: 'local', path: w.path };
  return { kind: 'none' };
}

/** "M H * * *" → daily；"M H * * D,E" → weekly。只接受 buildCronExpr 的输出格式。 */
export function parseCronToSchedule(cron: string): Extract<ScheduleInput, { kind: 'daily' | 'weekly' }> {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`unexpected cron '${cron}'`);
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  if (!Number.isInteger(minute) || !Number.isInteger(hour) || minute < 0 || minute > 59 || hour < 0 || hour > 23) {
    throw new Error(`unexpected cron '${cron}'`);
  }
  const dow = parts[4];
  if (dow === '*') return { kind: 'daily', hour, minute };
  const days = dow.split(',').map(Number);
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error(`unexpected cron '${cron}'`);
  return { kind: 'weekly', days, hour, minute };
}

/** "1h30m" → 90；只认 h/m 两个单位（buildIntervalString 的输出）。 */
export function parseIntervalToMinutes(interval: string): number {
  const hours = /(\d+)h/.exec(interval);
  const mins = /(\d+)m/.exec(interval);
  const h = hours ? Number(hours[1]) : 0;
  const m = mins ? Number(mins[1]) : 0;
  if (h === 0 && m === 0) throw new Error(`unexpected interval '${interval}'`);
  return h * 60 + m;
}

/** "90m" → 90；空/非纯分钟 → undefined。 */
export function timeoutToMinutes(timeout?: string): number | undefined {
  if (!timeout) return undefined;
  const m = /^(\d+)m$/.exec(timeout.trim());
  return m ? Number(m[1]) : undefined;
}

/** 校验 issue.path（形如 agents.0.provider）→ 向导步骤号；name/未知 → 确认页（4）。 */
export function issuePathToStep(path: string): number {
  if (path.includes('.provider') || path.includes('.model')) return 0;
  if (path.includes('.system_prompt') || path.includes('.env')) return 1;
  if (path.includes('.scheduler') || path.includes('.trigger')) return 2;
  if (path.includes('.workspace') || path.includes('.volumes') || path.includes('.mcp_servers') || path.includes('.skills')) return 3;
  return 4;
}
