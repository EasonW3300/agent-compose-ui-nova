import type { ProviderId } from './labels';
import type { ScheduleInput } from './schedule';
import { buildCronExpr, buildIntervalString } from './schedule';

export interface EnvPair {
  key: string;
  value: string;
}

export type WorkspaceDraft =
  | { kind: 'none' }
  | { kind: 'local'; path: string }
  | { kind: 'git'; url: string; branch?: string };

export interface VolumeMountDraft {
  source: string;
  target: string;
  readOnly: boolean;
}

export interface McpServerDraft {
  name: string;
  type: 'local' | 'remote';
  command?: string;
  args?: string[];
  url?: string;
}

export interface SkillDraft {
  name: string;
  url?: string;
  ref?: string;
}

export interface AgentDraft {
  name: string;
  displayName: string;
  description?: string;
  provider: ProviderId;
  model?: string;
  /** 任务说明（写入 trigger.prompt；system_prompt 的角色设定由向导单列） */
  prompt: string;
  systemPrompt?: string;
  env: EnvPair[];
  schedule: ScheduleInput;
  timeoutMinutes?: number;
  workspace: WorkspaceDraft;
  volumes: VolumeMountDraft[];
  mcpServers: McpServerDraft[];
  skills: SkillDraft[];
  jupyterEnabled: boolean;
}

/** 项目/agent 键名需匹配上游 stable identifier 格式：小写字母数字与连字符。 */
export function slugify(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'assistant';
}

export interface TriggerYamlEntry {
  name: string;
  cron?: string;
  interval?: string;
  timeout?: string;
}

export function buildTriggers(
  schedule: ScheduleInput,
  timeoutMinutes?: number,
): TriggerYamlEntry[] | null {
  const timeout = timeoutMinutes ? { timeout: `${timeoutMinutes}m` } : {};
  if (schedule.kind === 'manual') return null;
  if (schedule.kind === 'interval') {
    return [{ name: 'trigger', interval: buildIntervalString(schedule.minutes), ...timeout }];
  }
  return [{ name: 'trigger', cron: buildCronExpr(schedule), ...timeout }];
}

/** 创建向导的初始草稿。 */
export function emptyDraft(): AgentDraft {
  return {
    name: '',
    displayName: '',
    description: undefined,
    provider: 'claude',
    model: '',
    prompt: '',
    systemPrompt: undefined,
    env: [],
    schedule: { kind: 'manual' },
    timeoutMinutes: undefined,
    workspace: { kind: 'none' },
    volumes: [],
    mcpServers: [],
    skills: [],
    jupyterEnabled: false,
  };
}
