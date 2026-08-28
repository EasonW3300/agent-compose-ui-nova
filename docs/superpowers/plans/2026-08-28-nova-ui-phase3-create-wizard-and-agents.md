# Phase 3 创建向导 + Agent 列表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 1/2 基础上实现主控台世界的两个核心页面——「我的 AI 助手」卡片列表（§5.2）与 5 步 Agent 创建/编辑向导（§6），并把控制台基建补齐：React Query 数据层（§8）、401 全局弹回登录浮层（§8）、控制台路由骨架。

**Architecture:** 纯静态 React SPA 内新增主控台子路由（`/console/*`）。数据层用 `@tanstack/react-query` 管理 `ListProjects`/`GetProject`/`ValidateProject`/`ApplyProject` 等同步 RPC 的缓存与失效；401 由连接层 interceptor 捕获后派发全局事件，`AuthOverlay` 订阅并复用 Phase 2 的 `checkAccess` 登录流程。创建向导复用 Phase 2 的 `useSetupWizard` 步进与 `SetupStepIndicator` 同款步条（新建泛化的 `WizardStepBar`），内部维护 `AgentDraft`，保存走「ValidateProject → 字段级定位 → ApplyProject」，与 spec §6/§10.2 一致。

**Tech Stack:** React 19 + Vite + TS；`@tanstack/react-query@^5`（新增唯一依赖）；`@connectrpc/connect(-web)` v2 + buf 生成物（只读）；js-yaml 仅用于确认页预览；Vitest + Testing Library。

## Global Constraints

- **不修改 `src/api/gen/**`**：buf 生成物是只读的，上游同步流程另行处理（spec §9）。所有类型从生成物 import。
- **新增依赖仅 `@tanstack/react-query@^5`**（spec §8，controller 已确认）；其余一律不新增。
- **Strict TS**：`npm run build`（`tsc -b && vite build`）与 `npm run lint`（oxlint 零警告）必须通过；测试 `npx vitest run` 全绿。
- **文案转译**（`src/domain/labels.ts` 的 TERMS + 转译表）：agent→AI 助手、project→助手团队、provider→AI 引擎、scheduler→什么时候干活、volume→数据文件夹、workspace→工作材料、MCP server→插件、skill→技能包、sandbox→隔离工作台、trigger→触发方式、run→运行。
- **Provider 仅 claude/codex/pi/dsh**（`src/domain/labels.ts` PROVIDERS）。
- **任何 401 统一弹回登录浮层**（spec §8）：连接层 interceptor 抛错前派发 `acnova:unauthorized` 事件，AuthOverlay 订阅。
- **仅本机使用**；登录凭据存 localStorage（`src/api/connection.ts` 既有 `load/saveConnectionSettings`）。
- **TDD**：每个任务先写失败测试并确认红，再实现到绿。
- 分步向导复用 `useSetupWizard`（`src/hooks/useSetupWizard.ts`）与 `SetupStepIndicator` 同款步条样式；Phase 2 组件不改，新建泛化 `WizardStepBar` 供创建向导用。

## 裁决表（controller 开工前记录）

1. **React Query**：spec §8 明写，用户已确认「现在就加」→ 引入 `@tanstack/react-query@^5`。Phase 3 用 `useQuery`/`useMutation`；流式接口（WatchProject 等）仍按 spec §8 封装独立订阅 hook，不在本阶段。
2. **暂停/启用**：上游无 `setAgentEnabled` RPC → 用 `GetProject(includeSpec)` 取回 spec，翻转目标 agent 的 `enabled`，再 `ApplyProject` 全量重放。代价若错：并发编辑下会整体覆盖（本地单用户可接受）。
3. **下次运行时间**：`ProjectSummary`/`SchedulerSummary` 无 next_fire_at → 对每个带 scheduler 的 agent 调 `GetScheduler` 取首个 enabled trigger 的 `nextFireAt`（本地单用户 N+1 可接受）。
4. **模型型号**：Phase 3 用自由文本输入（占位提示常见型号）；capability catalog 选择留待设置页/Phase 4。
5. **测试运行一次**：先 Apply（未保存的草稿没有 projectId/agentName 可引用），成功后再 `StartAgentRun`（source=MANUAL），提示后跳 `/console/runs`（运行详情页是 Phase 4）。
6. **401 弹回登录**：transport `authInterceptor` 捕获 `Code.Unauthenticated` 时派发 `window` 自定义事件 `acnova:unauthorized`（模块常量 `UNAUTHORIZED_EVENT`）后继续抛错；`AuthOverlay` 订阅并复用 `checkAccess` 流程。Phase 2 的 `errorKind`/`checkAccess` 统一收敛到 `src/api/classify.ts` 的 `classifyError`。
7. **向导 env 语义**：`draft.env`（EnvPair[]）→ `AgentSpec.env`（`EnvVarSpec{name,value,secret:false}`）；secret 标记由设置页的 `UpdateGlobalEnv` 管理（Phase 2 R3），创建向导不做 secret 开关。
8. **向导保存路径**：按 spec §6「ValidateProject 校验 → 失败定位回步骤 → 通过后 ApplyProject」。校验 issue 的 `path`（形如 `agents.0.provider`）经 `issuePathToStep` 映射回步骤号（0-3）或确认页（4）。
9. **样式**：本阶段只落最低可用 CSS（`src/ui/console.css`：网格、卡片、浮层、向导布局）；完整视觉打磨沿用 Phase 2 结论（defer 到独立样式 pass）。
10. **编辑态路由**：`/console/agents/:agentName/edit`，其中 `agentName` 即项目名（向导单 agent 项目，`slugify(displayName)` 同时作为项目名与 agent 名，见 `composeYaml.ts`）。`ProjectRef` 用 `{ case: 'projectId', value }`（列表页）或 `{ case: 'name', value }`（编辑页）。

---

### Task 1: AgentDraft ⇄ ProjectSpec 双向映射（domain/projectSpec.ts）

**Files:**
- Create: `src/domain/projectSpec.ts`
- Test: `src/domain/projectSpec.test.ts`

**Interfaces:**
- Consumes: `AgentDraft` + `slugify`（`src/domain/agentDraft.ts`）；`ScheduleInput` + `buildCronExpr` + `buildIntervalString`（`src/domain/schedule.ts`）；`ProviderId`（`src/domain/labels.ts`）；gen 消息 Schema 与 `TriggerKind` 枚举（`src/api/gen/agentcompose/v2/agentcompose_pb.ts`）。
- Produces: `draftToProjectSpec(draft: AgentDraft): ProjectSpec`、`projectSpecToDraft(spec: ProjectSpec, agentName: string): AgentDraft`、`parseCronToSchedule(cron: string): Extract<ScheduleInput,{kind:'daily'|'weekly'}>`、`parseIntervalToMinutes(interval: string): number`、`timeoutToMinutes(timeout?: string): number | undefined`、`issuePathToStep(path: string): number`（Task 11 用）。

- [ ] **Step 1: 写失败测试**

创建 `src/domain/projectSpec.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
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
  it('手动调度不产出 scheduler', () => {
    const manual: AgentDraft = { ...base, schedule: { kind: 'manual' } };
    expect(draftToProjectSpec(manual).agents[0].scheduler).toBeUndefined();
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
```

> 注：`VolumeMountSpec.type` 是 `VolumeMountType` 枚举，`create()` 未指定时取默认 `UNSPECIFIED`(=0)，故断言 `type: 0` 成立。

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/domain/projectSpec.test.ts`
Expected: FAIL（模块不存在，全部用例红）

- [ ] **Step 3: 实现映射**

创建 `src/domain/projectSpec.ts`：

```ts
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
  TriggerKind,
  type AgentSpec,
  type EnvVarSpec,
  type MCPServerSpec,
  type ProjectSpec,
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
  if (draft.schedule.kind === 'manual') return undefined;
  const timeout = draft.timeoutMinutes ? { timeout: `${draft.timeoutMinutes}m` } : {};
  const trigger =
    draft.schedule.kind === 'interval'
      ? create(TriggerSpecSchema, {
          name: 'trigger',
          kind: TriggerKind.INTERVAL,
          interval: buildIntervalString(draft.schedule.minutes),
          prompt: draft.prompt,
          ...timeout,
        })
      : create(TriggerSpecSchema, {
          name: 'trigger',
          kind: TriggerKind.CRON,
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
    schedule: triggerToSchedule(trigger),
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
  if (trigger.kind === TriggerKind.TRIGGER_KIND_INTERVAL && trigger.interval) {
    return { kind: 'interval', minutes: parseIntervalToMinutes(trigger.interval) };
  }
  if (trigger.kind === TriggerKind.TRIGGER_KIND_CRON && trigger.cron) {
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
```

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/domain/projectSpec.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/domain/projectSpec.ts src/domain/projectSpec.test.ts
git commit -m "feat: AgentDraft<->ProjectSpec 双向映射 + cron/interval 解析"
```

---

### Task 2: Agent 卡片模型（domain/agentCard.ts）

**Files:**
- Create: `src/domain/agentCard.ts`
- Test: `src/domain/agentCard.test.ts`

**Interfaces:**
- Consumes: `Project`/`ProjectAgent`/`RunStatus` 枚举（gen）；`ProjectSummary`。
- Produces: `AgentCardStatus`、`agentCardStatus(agent): AgentCardStatus`、`describeAgentCardStatus(s)`、`runStatusLabel(genStatus): string`、`AgentCard` 接口、`projectToCards(project, nextFireFor): AgentCard[]`。

- [ ] **Step 1: 写失败测试**

创建 `src/domain/agentCard.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { RunStatus, type Project, type ProjectAgent } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { agentCardStatus, projectToCards, runStatusLabel, describeAgentCardStatus } from './agentCard';

function makeAgent(over: Partial<ProjectAgent>): ProjectAgent {
  return {
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
  };
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
  const project: Project = {
    summary: { projectId: 'p1', name: 'proj', sourcePath: '', currentRevision: 0n, specHash: '', agentCount: 1, schedulerCount: 1, runningRunCount: 0, latestRunId: '', createdAt: undefined, updatedAt: undefined, removedAt: undefined },
    spec: undefined,
    agents: [makeAgent({ agentName: 'a1' })],
    schedulers: [{ projectId: 'p1', agentName: 'a1', schedulerId: 's1', enabled: true, triggerCount: 1, displayName: '', description: '' }],
  };
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
    });
    expect(cards[0].nextFireAt?.toISOString()).toBe('2026-08-30T09:00:00.000Z');
  });
});
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/domain/agentCard.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `src/domain/agentCard.ts`：

```ts
import { RunStatus, type Project, type ProjectAgent } from '../api/gen/agentcompose/v2/agentcompose_pb';

export type AgentCardStatus = 'working' | 'paused' | 'errored' | 'idle';

/** 状态推导优先级：运行中 > 已暂停 > 出错 > 待命中。 */
export function agentCardStatus(agent: ProjectAgent): AgentCardStatus {
  if (agent.currentRun && agent.currentRun.runningRunCount > 0) return 'working';
  if (!agent.enabled) return 'paused';
  if (agent.latestRun && agent.latestRun.status === RunStatus.FAILED) return 'errored';
  return 'idle';
}

const AGENT_CARD_STATUS_LABELS: Record<AgentCardStatus, string> = {
  working: '正在工作',
  paused: '已暂停',
  errored: '出了点问题',
  idle: '待命中',
};

export function describeAgentCardStatus(s: AgentCardStatus): string {
  return AGENT_CARD_STATUS_LABELS[s];
}

/** gen RunStatus → 人话（buf 枚举成员是短形式：RunStatus.FAILED，无 SKIPPED）。 */
export function runStatusLabel(status: RunStatus): string {
  switch (status) {
    case RunStatus.RUNNING: return '正在工作';
    case RunStatus.SUCCEEDED: return '已完成';
    case RunStatus.FAILED: return '出了点问题';
    case RunStatus.CANCELED: return '已停止';
    case RunStatus.PENDING: return '排队中';
    default: return '未知';
  }
}

export interface AgentCard {
  key: string;
  projectId: string;
  agentName: string;
  projectName: string;
  displayName: string;
  provider: string;
  status: AgentCardStatus;
  schedulerEnabled: boolean;
  nextFireAt: Date | null;
  latestRun: { runId: string; statusLabel: string; at: Date | null } | null;
}

/** Project → 每 agent 一张卡片；nextFireFor 由数据层注入（Task 7 经 GetScheduler 解析）。 */
export function projectToCards(
  project: Project,
  nextFireFor: (a: ProjectAgent) => Date | null,
): AgentCard[] {
  const projectId = project.summary?.projectId ?? '';
  const projectName = project.summary?.name ?? project.spec?.name ?? '';
  return project.agents.map((a) => ({
    key: `${projectId}:${a.agentName}`,
    projectId,
    agentName: a.agentName,
    projectName,
    displayName: a.displayName || a.agentName,
    provider: a.provider,
    status: agentCardStatus(a),
    schedulerEnabled: a.schedulerEnabled,
    nextFireAt: nextFireFor(a),
    latestRun: a.latestRun
      ? { runId: a.latestRun.runId, statusLabel: runStatusLabel(a.latestRun.status), at: a.latestRun.at?.toDate() ?? null }
      : null,
  }));
}
```

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/domain/agentCard.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/domain/agentCard.ts src/domain/agentCard.test.ts
git commit -m "feat: Agent 卡片模型与状态推导"
```

---

### Task 3: 错误分类器统一 + 401 全局事件（classify.ts / connection.ts / settings.ts）

**Files:**
- Create: `src/api/classify.ts`
- Modify: `src/api/connection.ts`（`checkAccess` 改用 `classifyError`；`authInterceptor` 捕获 401 派发 `UNAUTHORIZED_EVENT` 并导出供测试）
- Modify: `src/api/settings.ts`（`errorKind` 改为 `classifyError` 的别名转发，保持 `ProviderKeysScreen` 引用不破）
- Test: `src/api/classify.test.ts`（新建）
- Test: `src/api/connection.test.ts`（追加 authInterceptor 401 派发用例）

**Interfaces:**
- Produces: `classifyError(err): 'auth'|'unreachable'|'other'`、`UNAUTHORIZED_EVENT: string`、导出的 `authInterceptor(token)`。
- Consumes: `ConnectError`/`Code`（`@connectrpc/connect`）。

- [ ] **Step 1: 写失败测试**

创建 `src/api/classify.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { Code, ConnectError } from '@connectrpc/connect';
import { classifyError } from './classify';

describe('classifyError', () => {
  it('401 → auth', () => {
    expect(classifyError(new ConnectError('x', Code.Unauthenticated))).toBe('auth');
  });
  it('Unavailable/DeadlineExceeded → unreachable', () => {
    expect(classifyError(new ConnectError('x', Code.Unavailable))).toBe('unreachable');
    expect(classifyError(new ConnectError('x', Code.DeadlineExceeded))).toBe('unreachable');
  });
  it('其他错误 → other', () => {
    expect(classifyError(new ConnectError('x', Code.Internal))).toBe('other');
    expect(classifyError(new Error('plain'))).toBe('other');
    expect(classifyError('nope')).toBe('other');
  });
});
```

读 `src/api/connection.test.ts`，在既有 `checkAccess` describe 内追加一个 401 派发用例（保持该文件既有的 mock 结构与 lazy-arrow 模式不动）：

```ts
  it('401 会派发全局 acnova:unauthorized 事件', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    statusMock.mockResolvedValue({});
    getGlobalEnvMock.mockRejectedValue(new ConnectError('unauth', Code.Unauthenticated));
    await checkAccess({ baseUrl: '', authToken: 't' });
    const calls = dispatchSpy.mock.calls.map((c) => (c[0] as Event).type);
    expect(calls).toContain('acnova:unauthorized');
  });
```

> 需要 `import { Code, ConnectError } from '@connectrpc/connect'` 已在该测试文件头部（若没有则补上，`@connectrpc/connect` 在 connection.test.ts 的 `vi.mock('@connectrpc/connect')` 工厂里 spread actual，真实类可引用）。

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/api/classify.test.ts src/api/connection.test.ts`
Expected: classify 红（模块不存在）、connection 新增用例红（无事件派发）

- [ ] **Step 3: 实现**

创建 `src/api/classify.ts`：

```ts
import { Code, ConnectError } from '@connectrpc/connect';

export type ErrorKind = 'auth' | 'unreachable' | 'other';

/** 统一错误分类：401→auth（密钥问题）；Unavailable/DeadlineExceeded→unreachable；其余→other。 */
export function classifyError(err: unknown): ErrorKind {
  if (err instanceof ConnectError) {
    if (err.code === Code.Unauthenticated) return 'auth';
    if (err.code === Code.Unavailable || err.code === Code.DeadlineExceeded) return 'unreachable';
  }
  return 'other';
}
```

修改 `src/api/connection.ts`（三处）：

```ts
import { createClient, Code, ConnectError, type Interceptor } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { HealthService } from './gen/health/v1/health_pb';
import { SettingsService } from './gen/agentcompose/v2/agentcompose_pb';
import { classifyError } from './classify';
```

```ts
/** 任何受保护 RPC 收到 401 时派发的全局事件；AuthOverlay 订阅它弹出登录浮层（spec §8）。 */
export const UNAUTHORIZED_EVENT = 'acnova:unauthorized';

export function authInterceptor(token: string): Interceptor {
  return (next) => async (req) => {
    if (token) req.header.set('Authorization', `Bearer ${token}`);
    try {
      return await next(req);
    } catch (err) {
      if (err instanceof ConnectError && err.code === Code.Unauthenticated) {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
      throw err;
    }
  };
}
```

（原 `authInterceptor` 私有函数体替换为上述导出版；`createDaemonTransport` 里 `interceptors: [authInterceptor(s.authToken)]` 不变。）

```ts
export type AccessCheck = 'ok' | 'invalid' | 'unreachable';

export async function checkAccess(s: ConnectionSettings): Promise<AccessCheck> {
  try {
    const client = createClient(SettingsService, createDaemonTransport(s));
    await client.getGlobalEnv({});
    return 'ok';
  } catch (err) {
    return classifyError(err) === 'auth' ? 'invalid' : 'unreachable';
  }
}
```

修改 `src/api/settings.ts`：

```ts
import { classifyError, type ErrorKind } from './classify';

// 兼容 ProviderKeysScreen 的既有引用：errorKind 即 classifyError。
export const errorKind: (err: unknown) => ErrorKind = classifyError;
```

（删除 settings.ts 里的 `import { Code, ConnectError } from '@connectrpc/connect'` 若不再被使用。）

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/api/classify.test.ts src/api/connection.test.ts && npm run build && npm run lint`
Expected: 全部绿、build 过、oxlint 零警告

- [ ] **Step 5: 提交**

```bash
git add src/api/classify.ts src/api/classify.test.ts src/api/connection.ts src/api/connection.test.ts src/api/settings.ts
git commit -m "feat: 统一错误分类器 + 401 全局事件派发"
```

---

### Task 4: 项目 API 层（api/projects.ts）

**Files:**
- Create: `src/api/projects.ts`
- Test: `src/api/projects.test.ts`

**Interfaces:**
- Consumes: `createDaemonTransport`/`ConnectionSettings`（connection.ts）；`classifyError`（classify.ts）；gen 的 `ProjectService`/`RunService`、`ProjectRef`、`ProjectSummary`、`Project`、`ProjectSpec`、`RunSummary`、`RunSource` 枚举。
- Produces: `listProjects(s): Promise<ProjectSummary[]>`、`getProject(s, ref, includeSpec): Promise<Project|undefined>`、`validateProject(s, spec): Promise<{valid, issues}>`、`applyProject(s, spec): Promise<{applied, issues}>`、`removeProject(s, ref): Promise<void>`、`startAgentRun(s, {projectId, agentName, prompt}): Promise<RunSummary>`、`getSchedulerNextFire(s, ref, agentName): Promise<Date|null>`、`setAgentEnabled(s, ref, agentName, enabled): Promise<boolean>`、`projectRefByName(name): ProjectRef`、`projectRefById(id): ProjectRef`。

- [ ] **Step 1: 写失败测试**

创建 `src/api/projects.test.ts`，先读 `src/api/connection.test.ts` 复刻其 mock 结构（mock `@connectrpc/connect-web` 的 `createConnectTransport` → fakeTransport；mock `@connectrpc/connect` 的 `createClient` → 返回带待测方法的 fake client）：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Code, ConnectError } from '@connectrpc/connect';
import { RunSource } from './gen/agentcompose/v2/agentcompose_pb';

const listProjectsMock = vi.fn();
const getProjectMock = vi.fn();
const validateProjectMock = vi.fn();
const applyProjectMock = vi.fn();
const removeProjectMock = vi.fn();
const startAgentRunMock = vi.fn();
const getSchedulerMock = vi.fn();

vi.mock('@connectrpc/connect-web', () => ({
  createConnectTransport: () => ({ __fake: true }),
}));

vi.mock('@connectrpc/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@connectrpc/connect')>();
  return {
    ...actual,
    createClient: () => ({
      listProjects: (...a: unknown[]) => listProjectsMock(...a),
      getProject: (...a: unknown[]) => getProjectMock(...a),
      validateProject: (...a: unknown[]) => validateProjectMock(...a),
      applyProject: (...a: unknown[]) => applyProjectMock(...a),
      removeProject: (...a: unknown[]) => removeProjectMock(...a),
      startAgentRun: (...a: unknown[]) => startAgentRunMock(...a),
      getScheduler: (...a: unknown[]) => getSchedulerMock(...a),
    }),
  };
});

import { listProjects, getProject, validateProject, applyProject, removeProject, startAgentRun, getSchedulerNextFire, setAgentEnabled, projectRefByName } from './projects';

const s = { baseUrl: '', authToken: '' };

describe('projects API', () => {
  beforeEach(() => {
    listProjectsMock.mockReset().mockResolvedValue({ projects: [], total: 0 });
    getProjectMock.mockReset();
    validateProjectMock.mockReset();
    applyProjectMock.mockReset();
    removeProjectMock.mockReset();
    startAgentRunMock.mockReset();
    getSchedulerMock.mockReset();
  });
  it('listProjects 返回摘要列表', async () => {
    listProjectsMock.mockResolvedValue({ projects: [{ projectId: 'p1', name: 'proj' }], total: 1 });
    await expect(listProjects(s)).resolves.toEqual([{ projectId: 'p1', name: 'proj' }]);
  });
  it('getProject includeSpec 传参正确并返回 project', async () => {
    getProjectMock.mockResolvedValue({ project: { name: 'p' } });
    const p = await getProject(s, projectRefByName('proj'), true);
    expect(getProjectMock).toHaveBeenCalledWith({ project: { case: 'name', value: 'proj' }, includeSpec: true });
    expect(p).toEqual({ name: 'p' });
  });
  it('getProject 空响应返回 undefined', async () => {
    getProjectMock.mockResolvedValue({});
    await expect(getProject(s, projectRefByName('p'), false)).resolves.toBeUndefined();
  });
  it('validateProject 返回 valid+issues', async () => {
    validateProjectMock.mockResolvedValue({ valid: false, issues: [{ severity: 2, path: 'agents.0.provider', message: 'x' }], specHash: '' });
    const r = await validateProject(s, {} as never);
    expect(r.valid).toBe(false);
    expect(r.issues).toHaveLength(1);
  });
  it('applyProject 返回 applied', async () => {
    applyProjectMock.mockResolvedValue({ applied: true, issues: [], unchanged: false });
    const r = await applyProject(s, {} as never);
    expect(r.applied).toBe(true);
  });
  it('removeProject 带 removeHistory/stopRunningSandboxes', async () => {
    await removeProject(s, projectRefByName('proj'));
    expect(removeProjectMock).toHaveBeenCalledWith({
      project: { case: 'name', value: 'proj' },
      removeHistory: true,
      stopRunningSandboxes: true,
    });
  });
  it('startAgentRun 用 MANUAL source 并返回 run 摘要', async () => {
    startAgentRunMock.mockResolvedValue({ run: { runId: 'r1', status: 2 }, started: true });
    const r = await startAgentRun(s, { projectId: 'p1', agentName: 'a1', prompt: '跑一下' });
    expect(startAgentRunMock).toHaveBeenCalledWith({
      run: { projectId: 'p1', agentName: 'a1', prompt: '跑一下', source: RunSource.MANUAL },
    });
    expect(r.runId).toBe('r1');
  });
  it('getSchedulerNextFire 取首个 enabled trigger 的 nextFireAt', async () => {
    getSchedulerMock.mockResolvedValue({
      triggers: [
        { enabled: false, nextFireAt: undefined },
        { enabled: true, nextFireAt: { toDate: () => new Date('2026-08-30T09:00:00Z') } },
      ],
    });
    const d = await getSchedulerNextFire(s, projectRefByName('proj'), 'a1');
    expect(d?.toISOString()).toBe('2026-08-30T09:00:00.000Z');
  });
  it('getSchedulerNextFire 无 enabled trigger → null', async () => {
    getSchedulerMock.mockResolvedValue({ triggers: [{ enabled: false, nextFireAt: undefined }] });
    await expect(getSchedulerNextFire(s, projectRefByName('proj'), 'a1')).resolves.toBeNull();
  });
  it('setAgentEnabled 用 includeSpec 拉回 spec、翻转 enabled、重新 apply', async () => {
    getProjectMock.mockResolvedValue({
      project: { spec: { name: 'proj', agents: [{ name: 'a1', enabled: true }] } },
    });
    applyProjectMock.mockResolvedValue({ applied: true, issues: [] });
    const ok = await setAgentEnabled(s, projectRefByName('proj'), 'a1', false);
    expect(ok).toBe(true);
    const specSent = applyProjectMock.mock.calls[0][0].spec;
    expect(specSent.agents[0].enabled).toBe(false);
  });
  it('401 分类为 auth 不吞错误', async () => {
    getProjectMock.mockRejectedValue(new ConnectError('u', Code.Unauthenticated));
    await expect(getProject(s, projectRefByName('p'), false)).rejects.toThrow();
  });
});
```

> 注：`ResolvedTrigger.nextFireAt` 是 `Timestamp`，实现走 `?.toDate()`；测试里 mock 成 `{ toDate: () => Date }` 以走通同一条路径。

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/api/projects.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `src/api/projects.ts`：

```ts
import { createClient } from '@connectrpc/connect';
import { createDaemonTransport, type ConnectionSettings } from './connection';
import { classifyError } from './classify';
import {
  ProjectService,
  RunService,
  RunSource,
  type Project,
  type ProjectRef,
  type ProjectSpec,
  type ProjectSummary,
  type RunSummary,
} from './gen/agentcompose/v2/agentcompose_pb';

function client(s: ConnectionSettings) {
  return createClient(ProjectService, createDaemonTransport(s));
}

function runClient(s: ConnectionSettings) {
  return createClient(RunService, createDaemonTransport(s));
}

export function projectRefByName(name: string): ProjectRef {
  return { case: 'name', value: name };
}

export function projectRefById(projectId: string): ProjectRef {
  return { case: 'projectId', value: projectId };
}

export async function listProjects(s: ConnectionSettings): Promise<ProjectSummary[]> {
  const res = await client(s).listProjects({});
  return res.projects;
}

export async function getProject(
  s: ConnectionSettings,
  ref: ProjectRef,
  includeSpec: boolean,
): Promise<Project | undefined> {
  const res = await client(s).getProject({ project: ref, includeSpec });
  return res.project;
}

export interface ValidateResult {
  valid: boolean;
  issues: { severity: number; path: string; message: string }[];
}

export async function validateProject(s: ConnectionSettings, spec: ProjectSpec): Promise<ValidateResult> {
  const res = await client(s).validateProject({ spec });
  return { valid: res.valid, issues: res.issues };
}

export async function applyProject(
  s: ConnectionSettings,
  spec: ProjectSpec,
): Promise<{ applied: boolean; issues: { severity: number; path: string; message: string }[]; project?: Project }> {
  const res = await client(s).applyProject({ spec });
  return { applied: res.applied, issues: res.issues, project: res.project };
}

export async function removeProject(s: ConnectionSettings, ref: ProjectRef): Promise<void> {
  await client(s).removeProject({ project: ref, removeHistory: true, stopRunningSandboxes: true });
}

export async function startAgentRun(
  s: ConnectionSettings,
  run: { projectId: string; agentName: string; prompt: string },
): Promise<RunSummary> {
  const res = await runClient(s).startAgentRun({
    run: { projectId: run.projectId, agentName: run.agentName, prompt: run.prompt, source: RunSource.MANUAL },
  });
  if (!res.run) throw new Error('startAgentRun 未返回 run');
  return res.run;
}

/** 取某 agent 调度器首个 enabled trigger 的 nextFireAt（裁决表 3）。 */
export async function getSchedulerNextFire(
  s: ConnectionSettings,
  ref: ProjectRef,
  agentName: string,
): Promise<Date | null> {
  const res = await client(s).getScheduler({ project: ref, agentName });
  const first = res.triggers.find((t) => t.enabled);
  return first?.nextFireAt?.toDate() ?? null;
}

/** 暂停/启用：拉回 spec → 翻转 agents[i].enabled → 重新 Apply（裁决表 2）。 */
export async function setAgentEnabled(
  s: ConnectionSettings,
  ref: ProjectRef,
  agentName: string,
  enabled: boolean,
): Promise<boolean> {
  const project = await getProject(s, ref, true);
  const spec = project?.spec;
  if (!spec) return false;
  const target = spec.agents.find((a) => a.name === agentName);
  if (!target) return false;
  const next: ProjectSpec = { ...spec, agents: spec.agents.map((a) => (a === target ? { ...a, enabled } : a)) };
  const res = await client(s).applyProject({ spec: next });
  return res.applied;
}
```

> 注：`setAgentEnabled` 中 `{ ...spec, agents: ... }` 展开 `Message` 是 plain object 结构复制，可被 `applyProject({ spec: next })` 接受（`PartialMessage<ProjectSpec>`）。如需严格 Message 类型可用 `create(ProjectSpecSchema, { ...spec, agents: [...] })`，见下一步 build 验证。

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/api/projects.test.ts && npm run build && npm run lint`
Expected: 全部绿。若 `{ ...spec }` 的类型不接受（Message 展开丢 `$typeName`），改用 `create(ProjectSpecSchema, {...})` 并 import `ProjectSpecSchema`。

- [ ] **Step 5: 提交**

```bash
git add src/api/projects.ts src/api/projects.test.ts
git commit -m "feat: 项目/运行 API 层（列表/校验/保存/运行/暂停/删除）"
```

---

### Task 5: React Query 接线（依赖 + provider + 测试助手）

**Files:**
- Modify: `package.json`（新增 `@tanstack/react-query`）
- Create: `src/lib/queryClient.ts`
- Create: `src/test/renderWithClient.tsx`
- Modify: `src/App.tsx`（用 `QueryClientProvider` 包裹）
- Test: `src/lib/queryClient.test.tsx`

**Interfaces:**
- Produces: `queryClient`（单例）、`renderWithClient(ui)` 测试助手。
- Consumes: `@tanstack/react-query`。

- [ ] **Step 1: 装依赖**

Run: `npm install @tanstack/react-query@^5`
Expected: `package.json` 的 dependencies 出现 `@tanstack/react-query`（^5.x）

- [ ] **Step 2: 写失败测试**

创建 `src/lib/queryClient.test.tsx`：

```tsx
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { renderWithClient } from '../test/renderWithClient';

function Probe() {
  const { data } = useQuery({
    queryKey: ['probe'],
    queryFn: async () => 'hello',
  });
  return <div>{data ?? 'loading'}</div>;
}

describe('renderWithClient', () => {
  it('把 useQuery 跑起来并渲染数据', async () => {
    renderWithClient(<Probe />);
    await waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: 运行确认红**

Run: `npx vitest run src/lib/queryClient.test.tsx`
Expected: FAIL（`../test/renderWithClient` 模块尚不存在，import 失败）

- [ ] **Step 4: 实现**

创建 `src/lib/queryClient.ts`：

```ts
import { QueryClient } from '@tanstack/react-query';

/** 应用级单例：查询默认不重试、不随窗口聚焦刷新，stale 30s。 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});
```

创建 `src/test/renderWithClient.tsx`：

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

/** 组件测试统一入口：每次渲染一个全新 QueryClient（retry:false 避免测试挂起）。 */
export function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
```

修改 `src/App.tsx`：保持探测/离线/在线分支结构不动，仅在外层包 `QueryClientProvider`：

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { useDaemonProbe } from './hooks/useDaemonProbe';
import { queryClient } from './lib/queryClient';
import { SetupShell } from './ui/SetupShell';
import { ConsoleLayout } from './ui/ConsoleLayout';

export default function App() {
  const { state } = useDaemonProbe();

  if (state === 'probing') {
    return <div role="status">正在寻找你电脑上的 agent-compose…</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {state === 'offline' ? <SetupShell /> : <ConsoleLayout />}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 5: 运行确认绿**

Run: `npx vitest run src/lib/queryClient.test.tsx && npm run build && npm run lint`
Expected: 全绿（既有 App.test 的 3 个用例不变，探测/离线/在线分支未动）

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json src/lib/queryClient.ts src/test/renderWithClient.tsx src/lib/queryClient.test.tsx src/App.tsx
git commit -m "feat: React Query 接线 + renderWithClient 测试助手"
```

---

### Task 6: 401 登录浮层 AuthOverlay

**Files:**
- Create: `src/ui/AuthOverlay.tsx`
- Modify: `src/ui/ConsoleLayout.tsx`（在 `nav` 与 `<Outlet/>` 外套一层并渲染 `<AuthOverlay/>`）
- Modify: `src/ui/ConsoleLayout.test.tsx`（用 `renderWithClient` 包裹）
- Test: `src/ui/AuthOverlay.test.tsx`

**Interfaces:**
- Consumes: `UNAUTHORIZED_EVENT`、`checkAccess`、`loadConnectionSettings`、`saveConnectionSettings`（connection.ts）；`useQueryClient`（react-query）。
- Produces: `AuthOverlay`（订阅全局 401 事件 → 弹浮层 → 校验通过后 invalidate 全部查询并关闭）。

- [ ] **Step 1: 写失败测试**

创建 `src/ui/AuthOverlay.test.tsx`（复刻 LoginScreen.test 的 mock 模式——mock `../api/connection`）：

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UNAUTHORIZED_EVENT } from '../api/connection';
import { renderWithClient } from '../test/renderWithClient';
import { AuthOverlay } from './AuthOverlay';

const checkAccessMock = vi.fn();
const saveConnectionSettingsMock = vi.fn();
const loadConnectionSettingsMock = vi.fn();

vi.mock('../api/connection', () => ({
  UNAUTHORIZED_EVENT: 'acnova:unauthorized',
  checkAccess: (...a: unknown[]) => checkAccessMock(...a),
  saveConnectionSettings: (...a: unknown[]) => saveConnectionSettingsMock(...a),
  loadConnectionSettings: () => loadConnectionSettingsMock(),
}));

describe('AuthOverlay', () => {
  beforeEach(() => {
    checkAccessMock.mockReset();
    saveConnectionSettingsMock.mockReset();
    loadConnectionSettingsMock.mockReset().mockReturnValue({ baseUrl: '', authToken: '' });
  });
  it('默认不渲染', () => {
    renderWithClient(<AuthOverlay />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('收到 acnova:unauthorized 后弹出登录浮层', () => {
    renderWithClient(<AuthOverlay />);
    act(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    });
    expect(screen.getByRole('dialog', { name: '访问密钥失效' })).toBeInTheDocument();
  });
  it('输入正确密钥并保存后关闭', async () => {
    const user = userEvent.setup();
    checkAccessMock.mockResolvedValue('ok');
    renderWithClient(<AuthOverlay />);
    act(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    });
    await user.type(screen.getByLabelText('访问密钥'), 'secret');
    await user.click(screen.getByRole('button', { name: /保存并重新连接/ }));
    expect(saveConnectionSettingsMock).toHaveBeenCalledWith({ baseUrl: '', authToken: 'secret' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('密钥错误给人话提示', async () => {
    const user = userEvent.setup();
    checkAccessMock.mockResolvedValue('invalid');
    renderWithClient(<AuthOverlay />);
    act(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    });
    await user.type(screen.getByLabelText('访问密钥'), 'bad');
    await user.click(screen.getByRole('button', { name: /保存并重新连接/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/密钥不正确/);
  });
  it('取消可关闭浮层', async () => {
    const user = userEvent.setup();
    renderWithClient(<AuthOverlay />);
    act(() => {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    });
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
```

> 注：`UNAUTHORIZED_EVENT` 在 mock 工厂里被 `vi.mock` 提升，直接在 `dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))` 引用会命中 mock 的常量（字符串），OK。若想用真实常量，`dispatchEvent(new CustomEvent('acnova:unauthorized'))` 也一样。

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/ui/AuthOverlay.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `src/ui/AuthOverlay.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UNAUTHORIZED_EVENT, checkAccess, loadConnectionSettings, saveConnectionSettings } from '../api/connection';

type State = 'idle' | 'checking' | 'invalid' | 'unreachable';

/** 全局 401 登录浮层：任何受保护 RPC 收到 401 时弹出，校验通过后清空查询缓存重连。 */
export function AuthOverlay() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    const onAuth = () => {
      setToken(loadConnectionSettings().authToken);
      setState('idle');
      setOpen(true);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onAuth);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onAuth);
  }, []);

  if (!open) return null;

  async function submit() {
    setState('checking');
    const s = { ...loadConnectionSettings(), authToken: token };
    saveConnectionSettings(s);
    const result = await checkAccess(s);
    if (result === 'ok') {
      setOpen(false);
      queryClient.invalidateQueries();
    } else if (result === 'invalid') {
      setState('invalid');
    } else {
      setState('unreachable');
    }
  }

  return (
    <div className="auth-overlay" role="dialog" aria-label="访问密钥失效">
      <h2>访问密钥失效</h2>
      <p>agent-compose 返回了「未授权」。重新输入访问密钥以继续（没有就留空直接重试）。</p>
      <label htmlFor="auth-overlay-token">访问密钥</label>
      <input
        id="auth-overlay-token"
        type="password"
        value={token}
        disabled={state === 'checking'}
        onChange={(e) => setToken(e.target.value)}
      />
      {state === 'invalid' && <p role="alert" className="auth-overlay__msg auth-overlay__msg--error">密钥不正确，请重试。</p>}
      {state === 'unreachable' && <p role="alert" className="auth-overlay__msg auth-overlay__msg--error">连不上 agent-compose，稍后再试。</p>}
      <div className="auth-overlay__actions">
        <button type="button" className="setup-btn" disabled={state === 'checking'} onClick={submit}>
          {state === 'checking' ? '连接中…' : '保存并重新连接'}
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setOpen(false)}>
          取消
        </button>
      </div>
    </div>
  );
}
```

修改 `src/ui/ConsoleLayout.tsx`（返回体在 `nav` 后追加 `<AuthOverlay/>`）：

```tsx
import { Link, Outlet, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from './navItems';
import { AuthOverlay } from './AuthOverlay';

export function ConsoleLayout() {
  const location = useLocation();
  return (
    <div className="console-layout">
      <nav aria-label="主导航">
        <ul>
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <li key={item.to}>
                <Link to={item.to} aria-current={active ? 'page' : undefined}>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Outlet />
      <AuthOverlay />
    </div>
  );
}
```

修改 `src/ui/ConsoleLayout.test.tsx`：把 `renderAt` 里 `render(...)` 换成 `renderWithClient(...)`（import 替换），因为 `ConsoleLayout` 现在包含需要 provider 的 `AuthOverlay`。

```tsx
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ConsoleLayout } from './ConsoleLayout';
import { renderWithClient } from '../test/renderWithClient';

function renderAt(path: string) {
  return renderWithClient(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/:page?" element={<ConsoleLayout />} />
      </Routes>
    </MemoryRouter>,
  );
}
```

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/ui/AuthOverlay.test.tsx src/ui/ConsoleLayout.test.tsx && npm run build && npm run lint`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add src/ui/AuthOverlay.tsx src/ui/AuthOverlay.test.tsx src/ui/ConsoleLayout.tsx src/ui/ConsoleLayout.test.tsx
git commit -m "feat: 401 全局登录浮层 AuthOverlay"
```

---

### Task 7: Agent 列表数据 hook（hooks/useAgents.ts）

**Files:**
- Create: `src/hooks/useAgents.ts`
- Test: `src/hooks/useAgents.test.tsx`

**Interfaces:**
- Consumes: `listProjects`/`getProject`/`getSchedulerNextFire`（projects.ts）；`loadConnectionSettings`（connection.ts）；`projectToCards`/`AgentCard`（agentCard.ts）；`projectRefById`。
- Produces: `useAgents(): UseQueryResult<AgentCard[]>`（queryKey `['agents']`）。

- [ ] **Step 1: 写失败测试**

创建 `src/hooks/useAgents.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAgents } from './useAgents';

const listProjectsMock = vi.fn();
const getProjectMock = vi.fn();
const getSchedulerNextFireMock = vi.fn();

vi.mock('../api/projects', () => ({
  listProjects: (...a: unknown[]) => listProjectsMock(...a),
  getProject: (...a: unknown[]) => getProjectMock(...a),
  getSchedulerNextFire: (...a: unknown[]) => getSchedulerNextFireMock(...a),
  projectRefById: (id: string) => ({ case: 'projectId', value: id }),
}));

vi.mock('../api/connection', () => ({
  loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useAgents', () => {
  beforeEach(() => {
    listProjectsMock.mockReset();
    getProjectMock.mockReset();
    getSchedulerNextFireMock.mockReset();
  });
  it('聚合 ListProjects+GetProject+GetScheduler 成 AgentCard 列表', async () => {
    listProjectsMock.mockResolvedValue([{ projectId: 'p1', name: 'proj' }]);
    getProjectMock.mockResolvedValue({
      project: {
        summary: { projectId: 'p1', name: 'proj' },
        agents: [{ agentName: 'a1', provider: 'claude', enabled: true, schedulerEnabled: true, displayName: '小助手', latestRun: undefined, currentRun: undefined }],
        schedulers: [{ agentName: 'a1' }],
      },
    });
    getSchedulerNextFireMock.mockResolvedValue(new Date('2026-08-30T09:00:00Z'));
    const { result } = renderHook(() => useAgents(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0]).toMatchObject({ projectId: 'p1', agentName: 'a1', provider: 'claude' });
    expect(getProjectMock).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, { case: 'projectId', value: 'p1' }, true);
    expect(getSchedulerNextFireMock).toHaveBeenCalled();
  });
  it('无项目时返回空数组', async () => {
    listProjectsMock.mockResolvedValue([]);
    const { result } = renderHook(() => useAgents(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });
});
```

> 注：mock 里 `Project` 用最小字段即可（测试只断言 hook 聚合结果，字段由 `projectToCards` 消费；若 `Project` 类型要求全字段，可 `as never` 或补全 summary/agents/schedulers 的必填字段）。

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/hooks/useAgents.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `src/hooks/useAgents.ts`：

```ts
import { useQuery } from '@tanstack/react-query';
import { getProject, getSchedulerNextFire, listProjects, projectRefById } from '../api/projects';
import { loadConnectionSettings } from '../api/connection';
import { projectToCards, type AgentCard } from '../domain/agentCard';
import type { Project } from '../api/gen/agentcompose/v2/agentcompose_pb';

/** 「我的 AI 助手」数据源：ListProjects → 每个项目 GetProject(includeSpec) → 每 agent 解析下次运行时间。 */
export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: async (): Promise<AgentCard[]> => {
      const s = loadConnectionSettings();
      const summaries = await listProjects(s);
      const projects = (
        await Promise.all(summaries.map((p) => getProject(s, projectRefById(p.projectId), true)))
      ).filter((p): p is Project => Boolean(p));
      const cards: AgentCard[] = [];
      for (const proj of projects) {
        const fire = new Map<string, Date | null>();
        for (const sch of proj.schedulers) {
          try {
            fire.set(sch.agentName, await getSchedulerNextFire(s, projectRefById(proj.summary?.projectId ?? ''), sch.agentName));
          } catch {
            fire.set(sch.agentName, null);
          }
        }
        cards.push(...projectToCards(proj, (a) => fire.get(a.agentName) ?? null));
      }
      return cards;
    },
  });
}
```

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/hooks/useAgents.test.tsx && npm run build && npm run lint`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add src/hooks/useAgents.ts src/hooks/useAgents.test.tsx
git commit -m "feat: useAgents 聚合 hook（列表+详情+下次运行）"
```

---

### Task 8: Agent 卡片 + 列表页（AgentCard / AgentListScreen）

**Files:**
- Create: `src/ui/AgentCard.tsx`
- Create: `src/ui/AgentListScreen.tsx`
- Modify: `src/ui/console.css`（新建，含 `.agent-*` 最低布局类）
- Test: `src/ui/AgentCard.test.tsx`
- Test: `src/ui/AgentListScreen.test.tsx`

**Interfaces:**
- Consumes: `useAgents`（hooks）；`AgentCard`/`describeAgentCardStatus`（agentCard.ts）；`removeProject`/`startAgentRun`/`setAgentEnabled`/`projectRefByName`（projects.ts）；`loadConnectionSettings`（connection.ts）；`PROVIDERS`（labels.ts）；`useNavigate`。
- Produces: `AgentCard({card, busy, onRun, onToggleEnabled, onEdit, onLogs, onDelete})`、`AgentListScreen()`（含「+ 新建」→ `/console/agents/new`，空态/加载态/错误态）。

- [ ] **Step 1: 写失败测试**

创建 `src/ui/AgentCard.test.tsx`：

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentCard } from '../domain/agentCard';
import { AgentCard as AgentCardComp } from './AgentCard';

const card: AgentCard = {
  key: 'p1:a1',
  projectId: 'p1',
  agentName: 'a1',
  projectName: 'proj',
  displayName: '我的日报',
  provider: 'claude',
  status: 'idle',
  schedulerEnabled: true,
  nextFireAt: new Date('2026-08-30T09:00:00Z'),
  latestRun: { runId: 'r1', statusLabel: '已完成', at: new Date('2026-08-29T08:00:00Z') },
};

describe('AgentCard', () => {
  it('展示名称、引擎、状态、下次运行、最近结果', () => {
    render(<AgentCardComp card={card} onRun={vi.fn()} onToggleEnabled={vi.fn()} onEdit={vi.fn()} onLogs={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('我的日报')).toBeInTheDocument();
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('待命中')).toBeInTheDocument();
    expect(screen.getByText(/下次：.*8月30日/)).toBeInTheDocument();
    expect(screen.getByText(/最近：已完成/)).toBeInTheDocument();
  });
  it('五个操作触发对应回调', async () => {
    const user = userEvent.setup();
    const handlers = { onRun: vi.fn(), onToggleEnabled: vi.fn(), onEdit: vi.fn(), onLogs: vi.fn(), onDelete: vi.fn() };
    render(<AgentCardComp card={card} {...handlers} />);
    await user.click(screen.getByRole('button', { name: /立即运行/ }));
    expect(handlers.onRun).toHaveBeenCalledWith(card);
    await user.click(screen.getByRole('button', { name: /暂停/ }));
    expect(handlers.onToggleEnabled).toHaveBeenCalledWith(card);
    await user.click(screen.getByRole('button', { name: /编辑/ }));
    expect(handlers.onEdit).toHaveBeenCalledWith(card);
    await user.click(screen.getByRole('button', { name: /日志/ }));
    expect(handlers.onLogs).toHaveBeenCalledWith(card);
    await user.click(screen.getByRole('button', { name: /删除/ }));
    expect(handlers.onDelete).toHaveBeenCalledWith(card);
  });
});
```

创建 `src/ui/AgentListScreen.test.tsx`：

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { AgentListScreen } from './AgentListScreen';

const useAgentsMock = vi.fn();
const removeProjectMock = vi.fn();
const startAgentRunMock = vi.fn();
const setAgentEnabledMock = vi.fn();

vi.mock('../hooks/useAgents', () => ({ useAgents: (...a: unknown[]) => useAgentsMock(...a) }));
vi.mock('../api/projects', () => ({
  removeProject: (...a: unknown[]) => removeProjectMock(...a),
  startAgentRun: (...a: unknown[]) => startAgentRunMock(...a),
  setAgentEnabled: (...a: unknown[]) => setAgentEnabledMock(...a),
  projectRefByName: (name: string) => ({ case: 'name', value: name }),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

const card = {
  key: 'p1:a1', projectId: 'p1', agentName: 'a1', projectName: 'proj',
  displayName: '我的日报', provider: 'claude', status: 'idle', schedulerEnabled: true,
  nextFireAt: new Date('2026-08-30T09:00:00Z'),
  latestRun: { runId: 'r1', statusLabel: '已完成', at: null },
};

function renderScreen() {
  return renderWithClient(
    <MemoryRouter initialEntries={['/console/agents']}>
      <AgentListScreen />
    </MemoryRouter>,
  );
}

describe('AgentListScreen', () => {
  beforeEach(() => {
    useAgentsMock.mockReset();
    removeProjectMock.mockReset().mockResolvedValue(undefined);
    startAgentRunMock.mockReset().mockResolvedValue({ runId: 'r9' });
    setAgentEnabledMock.mockReset().mockResolvedValue(true);
  });
  it('加载中给状态提示', () => {
    useAgentsMock.mockReturnValue({ data: undefined, isLoading: true });
    renderScreen();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
  it('有 agent 时渲染卡片网格', async () => {
    useAgentsMock.mockReturnValue({ data: [card], isLoading: false });
    renderScreen();
    await waitFor(() => expect(screen.getByText('我的日报')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /新建/ })).toBeInTheDocument();
  });
  it('空列表给引导文案', () => {
    useAgentsMock.mockReturnValue({ data: [], isLoading: false });
    renderScreen();
    expect(screen.getByText(/还没有 AI 助手/)).toBeInTheDocument();
  });
  it('加载失败给人话错误 + 重试按钮', () => {
    useAgentsMock.mockReturnValue({ data: undefined, isError: true, refetch: vi.fn() });
    renderScreen();
    expect(screen.getByText(/加载失败/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重试/ })).toBeInTheDocument();
  });
  it('点击删除进入确认，确认后调 removeProject', async () => {
    const user = userEvent.setup();
    useAgentsMock.mockReturnValue({ data: [card], isLoading: false });
    renderScreen();
    await user.click(screen.getByRole('button', { name: /删除/ }));
    await user.click(screen.getByRole('button', { name: /确认删除/ }));
    await waitFor(() => expect(removeProjectMock).toHaveBeenCalled());
  });
  it('点击立即运行调 startAgentRun', async () => {
    const user = userEvent.setup();
    useAgentsMock.mockReturnValue({ data: [card], isLoading: false });
    renderScreen();
    await user.click(screen.getByRole('button', { name: /立即运行/ }));
    await waitFor(() => expect(startAgentRunMock).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/ui/AgentCard.test.tsx src/ui/AgentListScreen.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `src/ui/console.css`（最低可用样式；完整打磨 defer，裁决表 9）：

```css
.console-page { padding: 24px; max-width: 1080px; }
.console-page__head { display: flex; align-items: center; justify-content: space-between; }
.agent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-top: 16px; }
.agent-card { border: 1px solid var(--ac-border, #d5d5d5); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.agent-card__title { font-weight: 600; }
.agent-card__meta { color: #666; font-size: 13px; }
.agent-card__badge { align-self: flex-start; padding: 2px 10px; border-radius: 999px; font-size: 12px; }
.agent-card__badge--working { background: #dbeafe; color: #1e40af; }
.agent-card__badge--paused { background: #f3f4f6; color: #6b7280; }
.agent-card__badge--errored { background: #fee2e2; color: #b91c1c; }
.agent-card__badge--idle { background: #dcfce7; color: #15803d; }
.agent-card__actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.auth-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: grid; place-items: center; z-index: 50; }
.auth-overlay > div { background: #fff; border-radius: 12px; padding: 24px; width: min(420px, 90vw); display: flex; flex-direction: column; gap: 10px; }
.auth-overlay__msg--error { color: #b91c1c; }
.auth-overlay__actions { display: flex; gap: 8px; margin-top: 8px; }
.wizard-shell { max-width: 760px; margin: 0 auto; padding: 24px; }
.wizard-steps { display: flex; gap: 4px; list-style: none; padding: 0; margin: 0 0 16px; }
.wizard-step { flex: 1; }
.wizard-step__btn { width: 100%; border: 0; background: none; cursor: pointer; text-align: center; font-size: 13px; color: #999; }
.wizard-step--current .wizard-step__btn { color: #111; font-weight: 600; }
.wizard-step--done .wizard-step__btn { color: #2563eb; }
.wizard-step__btn:disabled { cursor: default; }
```

创建 `src/ui/AgentCard.tsx`：

```tsx
import { PROVIDERS } from '../domain/labels';
import { describeAgentCardStatus, type AgentCard as AgentCardModel } from '../domain/agentCard';

interface Props {
  card: AgentCardModel;
  busy?: boolean;
  onRun: (c: AgentCardModel) => void;
  onToggleEnabled: (c: AgentCardModel) => void;
  onEdit: (c: AgentCardModel) => void;
  onLogs: (c: AgentCardModel) => void;
  onDelete: (c: AgentCardModel) => void;
}

const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
function formatDate(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function badgeClass(status: string): string {
  return `agent-card__badge agent-card__badge--${status}`;
}

export function AgentCard({ card, busy, onRun, onToggleEnabled, onEdit, onLogs, onDelete }: Props) {
  const provider = PROVIDERS.find((p) => p.id === card.provider);
  return (
    <article className="agent-card">
      <h3 className="agent-card__title">{card.displayName}</h3>
      <span className={badgeClass(card.status)} data-testid={`status-${card.status}`}>
        {describeAgentCardStatus(card.status)}
      </span>
      <p className="agent-card__meta">{provider?.label ?? card.provider}</p>
      {card.nextFireAt && (
        <p className="agent-card__meta">下次：{formatDate(card.nextFireAt)}</p>
      )}
      {card.latestRun && (
        <p className="agent-card__meta">
          最近：{card.latestRun.statusLabel}
          {card.latestRun.at ? ` · ${formatDate(card.latestRun.at)}` : ''}
        </p>
      )}
      <div className="agent-card__actions">
        <button type="button" className="setup-btn" disabled={busy} onClick={() => onRun(card)}>
          {card.status === 'working' ? '正在运行…' : '立即运行'}
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" disabled={busy} onClick={() => onToggleEnabled(card)}>
          {card.schedulerEnabled ? '暂停' : '启用'}
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => onEdit(card)}>编辑</button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => onLogs(card)}>日志</button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => onDelete(card)}>删除</button>
      </div>
    </article>
  );
}
```

创建 `src/ui/AgentListScreen.tsx`：

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { loadConnectionSettings } from '../api/connection';
import { projectRefByName, removeProject, setAgentEnabled, startAgentRun } from '../api/projects';
import { useAgents } from '../hooks/useAgents';
import type { AgentCard as AgentCardModel } from '../domain/agentCard';
import { AgentCard } from './AgentCard';

export function AgentListScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useAgents();
  const [confirming, setConfirming] = useState<AgentCardModel | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['agents'] });

  const runMutation = useMutation({
    mutationFn: async (c: AgentCardModel) => {
      const s = loadConnectionSettings();
      await startAgentRun(s, { projectId: c.projectId, agentName: c.agentName, prompt: '' });
    },
    onSuccess: invalidate,
  });
  const toggleMutation = useMutation({
    mutationFn: async (c: AgentCardModel) => {
      const s = loadConnectionSettings();
      await setAgentEnabled(s, projectRefByName(c.projectName), c.agentName, !c.schedulerEnabled);
    },
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: async (c: AgentCardModel) => {
      const s = loadConnectionSettings();
      await removeProject(s, projectRefByName(c.projectName));
    },
    onSuccess: () => {
      setConfirming(null);
      invalidate();
    },
  });

  if (isLoading) return <div className="console-page" role="status">正在加载你的 AI 助手…</div>;
  if (isError) {
    return (
      <div className="console-page">
        <p role="alert">加载失败，连不上 agent-compose。</p>
        <button type="button" className="setup-btn" onClick={() => refetch()}>重试</button>
      </div>
    );
  }
  const cards = data ?? [];

  return (
    <section className="console-page">
      <div className="console-page__head">
        <h2>我的 AI 助手</h2>
        <button type="button" className="setup-btn" onClick={() => navigate('/console/agents/new')}>
          + 新建
        </button>
      </div>
      {cards.length === 0 ? (
        <p>还没有 AI 助手。点右上角「+ 新建」，照着向导几分钟就能跑起第一个。</p>
      ) : (
        <div className="agent-grid">
          {cards.map((c) => (
            <AgentCard
              key={c.key}
              card={c}
              busy={runMutation.isPending || toggleMutation.isPending}
              onRun={(cc) => runMutation.mutate(cc)}
              onToggleEnabled={(cc) => toggleMutation.mutate(cc)}
              onEdit={(cc) => navigate(`/console/agents/${cc.agentName}/edit`)}
              onLogs={() => navigate('/console/runs')}
              onDelete={(cc) => setConfirming(cc)}
            />
          ))}
        </div>
      )}
      {confirming && (
        <div className="auth-overlay" role="dialog" aria-label="删除确认">
          <div>
            <h3>删除「{confirming.displayName}」？</h3>
            <p>会删除它的调度记录并停止正在运行的沙箱，这一步无法撤销。</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(confirming)}>
                {deleteMutation.isPending ? '删除中…' : '确认删除'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirming(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/ui/AgentCard.test.tsx src/ui/AgentListScreen.test.tsx && npm run build && npm run lint`
Expected: 全绿。若 `AgentListScreen` 的 `useMutation` 在测试里 `loadConnectionSettings` 未 mock（mock 里已有），注意 `projectRefByName` 已 mock。

- [ ] **Step 5: 提交**

```bash
git add src/ui/console.css src/ui/AgentCard.tsx src/ui/AgentCard.test.tsx src/ui/AgentListScreen.tsx src/ui/AgentListScreen.test.tsx
git commit -m "feat: Agent 卡片与列表页（运行/暂停/编辑/日志/删除）"
```

---

### Task 9: 创建向导骨架 + 引擎/任务步

**Files:**
- Create: `src/ui/createWizardSteps.ts`
- Create: `src/ui/WizardStepBar.tsx`
- Create: `src/ui/steps/EngineStep.tsx`
- Create: `src/ui/steps/TaskStep.tsx`
- Create: `src/ui/steps/WizardStepProps.ts`
- Create: `src/ui/CreateWizard.tsx`
- Test: `src/ui/steps/EngineStep.test.tsx`
- Test: `src/ui/steps/TaskStep.test.tsx`
- Test: `src/ui/WizardStepBar.test.tsx`

**Interfaces:**
- Consumes: `useSetupWizard`（hooks）；`PROVIDERS`/`ProviderId`（labels.ts）；`AgentDraft`/`emptyDraft`（本任务产出 `emptyDraft` 放 `agentDraft.ts`）；`useParams`（react-router）。
- Produces: `CREATE_STEPS`、`WizardStepBar({steps,currentStep,onStepClick})`、`WizardStepProps`、`EngineStep`、`TaskStep`、`CreateWizard`（编辑态经 `/console/agents/:agentName/edit` 拉 `GetProject` 回填）。

> `emptyDraft()` 加入 `src/domain/agentDraft.ts`：

```ts
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
```

- [ ] **Step 1: 写失败测试**

创建 `src/ui/createWizardSteps.ts`：

```ts
export const CREATE_STEPS = ['AI 引擎', '任务说明', '什么时候干活', '工作材料', '确认创建'] as const;
```

创建 `src/ui/WizardStepBar.test.tsx`：

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WizardStepBar } from './WizardStepBar';
import { CREATE_STEPS } from './createWizardSteps';

describe('WizardStepBar', () => {
  it('渲染 5 步、当前步 aria-current=step、未来步禁用', () => {
    render(<WizardStepBar steps={CREATE_STEPS} currentStep={2} onStepClick={vi.fn()} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('AI 引擎')).toBeInTheDocument();
    expect(screen.getByText('确认创建')).toBeInTheDocument();
    const current = screen.getByRole('button', { name: /什么时候干活/ });
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: /确认创建/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /AI 引擎/ })).not.toBeDisabled();
  });
  it('点击已访问步触发回调', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<WizardStepBar steps={CREATE_STEPS} currentStep={3} onStepClick={onClick} />);
    await user.click(screen.getByRole('button', { name: /任务说明/ }));
    expect(onClick).toHaveBeenCalledWith(1);
  });
});
```

创建 `src/ui/steps/EngineStep.test.tsx`：

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentDraft } from '../../domain/agentDraft';
import { emptyDraft } from '../../domain/agentDraft';
import { EngineStep } from './EngineStep';

function renderStep(draft: AgentDraft, update = vi.fn(), goNext = vi.fn()) {
  return { user: userEvent.setup(), update, goNext, ...render(<EngineStep draft={draft} update={update} goNext={goNext} goBack={vi.fn()} />) };
}

describe('EngineStep', () => {
  it('展示四个引擎卡片', () => {
    renderStep(emptyDraft());
    for (const name of ['Claude Code', 'Codex', 'Pi', 'DSH']) {
      expect(screen.getByRole('radio', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });
  it('选择引擎与输入模型会写入草稿', async () => {
    const draft = emptyDraft();
    const update = vi.fn();
    const { user } = renderStep(draft, update);
    await user.click(screen.getByRole('radio', { name: /Codex/ }));
    expect(update).toHaveBeenCalledWith({ provider: 'codex' });
    await user.type(screen.getByLabelText('模型型号'), 'gpt-5');
    expect(update).toHaveBeenCalledWith({ model: 'gpt-5' });
  });
  it('未选引擎时点继续给提示并拦截', async () => {
    const goNext = vi.fn();
    const { user } = renderStep(emptyDraft(), vi.fn(), goNext);
    await user.click(screen.getByRole('button', { name: '继续' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/选一个 AI 引擎/);
    expect(goNext).not.toHaveBeenCalled();
  });
});
```

创建 `src/ui/steps/TaskStep.test.tsx`：

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyDraft, type AgentDraft } from '../../domain/agentDraft';
import { TaskStep } from './TaskStep';

describe('TaskStep', () => {
  it('点示例填入任务说明', async () => {
    const draft = emptyDraft();
    const update = vi.fn();
    const user = userEvent.setup();
    render(<TaskStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /每天整理/ }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringMatching(/整理/) }));
  });
  it('空任务说明拦截继续', async () => {
    const goNext = vi.fn();
    const user = userEvent.setup();
    render(<TaskStep draft={emptyDraft()} update={vi.fn()} goNext={goNext} goBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '继续' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/先说说要它干什么/);
    expect(goNext).not.toHaveBeenCalled();
  });
  it('折叠区能添加环境变量', async () => {
    const draft: AgentDraft = { ...emptyDraft(), prompt: 'x' };
    const update = vi.fn();
    const user = userEvent.setup();
    render(<TaskStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /环境变量/ }));
    await user.click(screen.getByRole('button', { name: /加一个环境变量/ }));
    await user.type(screen.getAllByLabelText('变量名')[0], 'TZ');
    await user.type(screen.getAllByLabelText('变量值')[0], 'Asia/Shanghai');
    expect(update).toHaveBeenCalledWith({ env: [{ key: 'TZ', value: 'Asia/Shanghai' }] });
  });
});
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/ui/WizardStepBar.test.tsx src/ui/steps/EngineStep.test.tsx src/ui/steps/TaskStep.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `src/ui/WizardStepBar.tsx`（泛化步条，供创建向导用；Phase 2 的 `SetupStepIndicator` 不动）：

```tsx
interface Props {
  steps: readonly string[];
  currentStep: number;
  onStepClick: (index: number) => void;
}

export function WizardStepBar({ steps, currentStep, onStepClick }: Props) {
  return (
    <ol className="wizard-steps" aria-label="创建步骤">
      {steps.map((name, i) => {
        const state = i < currentStep ? 'done' : i === currentStep ? 'current' : 'todo';
        return (
          <li key={name} className={`wizard-step wizard-step--${state}`}>
            <button
              type="button"
              className="wizard-step__btn"
              aria-current={state === 'current' ? 'step' : undefined}
              disabled={i > currentStep}
              onClick={() => onStepClick(i)}
            >
              <span>{name}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
```

创建 `src/ui/steps/WizardStepProps.ts`：

```ts
import type { AgentDraft } from '../../domain/agentDraft';

export interface WizardStepProps {
  draft: AgentDraft;
  update: (patch: Partial<AgentDraft>) => void;
  goNext: () => void;
  goBack: () => void;
}
```

创建 `src/ui/steps/EngineStep.tsx`：

```tsx
import { useState } from 'react';
import { PROVIDERS } from '../../domain/labels';
import type { WizardStepProps } from './WizardStepProps';

export function EngineStep({ draft, update, goNext }: WizardStepProps) {
  const [error, setError] = useState<string | null>(null);
  function next() {
    if (!draft.provider) {
      setError('先选一个 AI 引擎，再继续。');
      return;
    }
    goNext();
  }
  return (
    <section aria-label="选 AI 引擎">
      <h2>选一个 AI 引擎</h2>
      <fieldset>
        <legend className="sr-only">AI 引擎</legend>
        {PROVIDERS.map((p) => (
          <label key={p.id} className="engine-card">
            <input
              type="radio"
              name="provider"
              checked={draft.provider === p.id}
              onChange={() => update({ provider: p.id })}
            />
            <strong>{p.label}</strong>
            <span>{p.tagline}</span>
            <span>{p.scenarios}</span>
          </label>
        ))}
      </fieldset>
      <label htmlFor="engine-model">模型型号（可留空用引擎默认）</label>
      <input
        id="engine-model"
        type="text"
        value={draft.model ?? ''}
        placeholder="例如 claude-sonnet-5 / gpt-5"
        onChange={(e) => update({ model: e.target.value })}
      />
      {error && <p role="alert">{error}</p>}
      <div className="wizard-nav">
        <button type="button" className="setup-btn" onClick={next}>继续</button>
      </div>
    </section>
  );
}
```

创建 `src/ui/steps/TaskStep.tsx`：

```tsx
import { useState } from 'react';
import type { WizardStepProps } from './WizardStepProps';

const EXAMPLES = [
  { label: '每天整理一下我的工作日志', text: '每天早上打开我的工作日志，整理成三条要点，并列出今天该跟进的事。' },
  { label: '监控一个网页的变化', text: '每 30 分钟检查一次 https://example.com 的价格，变化超过 5% 就写一份报告。' },
];

export function TaskStep({ draft, update, goNext }: WizardStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  function next() {
    if (!draft.prompt.trim()) {
      setError('先说说要它干什么，一句话就行。');
      return;
    }
    goNext();
  }
  return (
    <section aria-label="任务说明">
      <h2>告诉它要干什么</h2>
      <label htmlFor="task-prompt">任务说明</label>
      <textarea
        id="task-prompt"
        rows={5}
        value={draft.prompt}
        placeholder="例如：每天早上 9 点，把销售报表里的数字汇总成一段人话总结。"
        onChange={(e) => update({ prompt: e.target.value })}
      />
      <div className="task-examples">
        {EXAMPLES.map((ex) => (
          <button key={ex.label} type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ prompt: ex.text })}>
            {ex.label}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setShowAdvanced((v) => !v)}>
        {showAdvanced ? '收起高级设置' : '高级设置'}
      </button>
      {showAdvanced && (
        <div className="wizard-advanced">
          <label htmlFor="task-sys">角色设定（system prompt）</label>
          <textarea
            id="task-sys"
            rows={3}
            value={draft.systemPrompt ?? ''}
            onChange={(e) => update({ systemPrompt: e.target.value })}
          />
          <h4>环境变量</h4>
          {draft.env.map((pair, i) => (
            <div key={i} className="env-row">
              <input
                aria-label="变量名"
                value={pair.key}
                onChange={(e) => {
                  const env = draft.env.map((p, j) => (j === i ? { ...p, key: e.target.value } : p));
                  update({ env });
                }}
              />
              <input
                aria-label="变量值"
                value={pair.value}
                onChange={(e) => {
                  const env = draft.env.map((p, j) => (j === i ? { ...p, value: e.target.value } : p));
                  update({ env });
                }}
              />
              <button
                type="button"
                className="setup-btn setup-btn--ghost"
                onClick={() => update({ env: draft.env.filter((_, j) => j !== i) })}
              >
                删
              </button>
            </div>
          ))}
          <button
            type="button"
            className="setup-btn setup-btn--ghost"
            onClick={() => update({ env: [...draft.env, { key: '', value: '' }] })}
          >
            + 加一个环境变量
          </button>
        </div>
      )}
      <div className="wizard-nav">
        <button type="button" className="setup-btn" onClick={next}>继续</button>
      </div>
    </section>
  );
}
```

创建 `src/ui/CreateWizard.tsx`（骨架 + 编辑回填；Task 12 接入保存）：

```tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import { getProject } from '../api/projects';
import { projectSpecToDraft } from '../domain/projectSpec';
import { emptyDraft, type AgentDraft } from '../domain/agentDraft';
import { useSetupWizard } from '../hooks/useSetupWizard';
import { CREATE_STEPS } from './createWizardSteps';
import { WizardStepBar } from './WizardStepBar';
import { EngineStep } from './steps/EngineStep';
import { TaskStep } from './steps/TaskStep';

export function CreateWizard() {
  const { agentName } = useParams();
  const editing = Boolean(agentName);
  const { step, goNext, goBack, goTo } = useSetupWizard(CREATE_STEPS.length);
  const [draft, setDraft] = useState<AgentDraft>(emptyDraft());

  const { data: loaded, isError } = useQuery({
    queryKey: ['project-for-edit', agentName],
    queryFn: async () => {
      const s = loadConnectionSettings();
      const project = await getProject(s, { case: 'name', value: agentName! }, true);
      if (!project?.spec) return null;
      return projectSpecToDraft(project.spec, agentName!);
    },
    enabled: editing,
  });

  useEffect(() => {
    if (loaded) setDraft(loaded);
  }, [loaded]);

  if (editing && isError) return <p role="alert">找不到这个 AI 助手。</p>;

  const update = (patch: Partial<AgentDraft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <main className="wizard-shell">
      <h1>{editing ? '编辑 AI 助手' : '新建 AI 助手'}</h1>
      <WizardStepBar steps={CREATE_STEPS} currentStep={step} onStepClick={goTo} />
      {step > 0 && (
        <button type="button" className="setup-back" onClick={goBack}>← 上一步</button>
      )}
      {step === 0 && <EngineStep draft={draft} update={update} goNext={goNext} goBack={goBack} />}
      {step === 1 && <TaskStep draft={draft} update={update} goNext={goNext} goBack={goBack} />}
    </main>
  );
}
```

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/ui/WizardStepBar.test.tsx src/ui/steps/EngineStep.test.tsx src/ui/steps/TaskStep.test.tsx && npm run build && npm run lint`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add src/domain/agentDraft.ts src/ui/createWizardSteps.ts src/ui/WizardStepBar.tsx src/ui/WizardStepBar.test.tsx src/ui/steps/WizardStepProps.ts src/ui/steps/EngineStep.tsx src/ui/steps/EngineStep.test.tsx src/ui/steps/TaskStep.tsx src/ui/steps/TaskStep.test.tsx src/ui/CreateWizard.tsx
git commit -m "feat: 创建向导骨架 + 引擎/任务步"
```

---

### Task 10: 触发/材料步（ScheduleStep / MaterialsStep）

**Files:**
- Create: `src/ui/steps/ScheduleStep.tsx`
- Create: `src/ui/steps/MaterialsStep.tsx`
- Test: `src/ui/steps/ScheduleStep.test.tsx`
- Test: `src/ui/steps/MaterialsStep.test.tsx`
- Modify: `src/ui/CreateWizard.tsx`（接上 step===2/3）

**Interfaces:**
- Consumes: `ScheduleInput`/`describeSchedule`（schedule.ts）；`AgentDraft`/`WorkspaceDraft`/`VolumeMountDraft`/`McpServerDraft`/`SkillDraft`；`WizardStepProps`。
- Produces: `ScheduleStep`（手动/定时/间隔 三态 + 折叠超时）、`MaterialsStep`（工作区三选 + 数据文件夹列表 + 折叠插件/技能/Jupyter）。

- [ ] **Step 1: 写失败测试**

创建 `src/ui/steps/ScheduleStep.test.tsx`：

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyDraft } from '../../domain/agentDraft';
import { ScheduleStep } from './ScheduleStep';

describe('ScheduleStep', () => {
  it('三种触发方式可视化卡片', () => {
    render(<ScheduleStep draft={emptyDraft()} update={vi.fn()} goNext={vi.fn()} goBack={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /手动/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /定时/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /固定间隔/ })).toBeInTheDocument();
  });
  it('选定时展开 每天/每周 + 时间选择，写入 daily', async () => {
    const draft = emptyDraft();
    const update = vi.fn();
    const user = userEvent.setup();
    render(<ScheduleStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /定时/ }));
    await user.click(screen.getByRole('radio', { name: /每天/ }));
    expect(update).toHaveBeenCalledWith({ schedule: { kind: 'daily', hour: 9, minute: 0 } });
  });
  it('选固定间隔填数字写入 interval', async () => {
    const draft = emptyDraft();
    const update = vi.fn();
    const user = userEvent.setup();
    render(<ScheduleStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /固定间隔/ }));
    await user.type(screen.getByLabelText('间隔分钟数'), '90');
    expect(update).toHaveBeenCalledWith({ schedule: { kind: 'interval', minutes: 90 } });
  });
  it('超时折叠区写 timeoutMinutes', async () => {
    const draft = emptyDraft();
    const update = vi.fn();
    const user = userEvent.setup();
    render(<ScheduleStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /超时/ }));
    await user.type(screen.getByLabelText('超时分钟数'), '60');
    expect(update).toHaveBeenCalledWith({ timeoutMinutes: 60 });
  });
});
```

创建 `src/ui/steps/MaterialsStep.test.tsx`：

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyDraft } from '../../domain/agentDraft';
import { MaterialsStep } from './MaterialsStep';

describe('MaterialsStep', () => {
  it('工作区三选：空/本地路径/Git', () => {
    render(<MaterialsStep draft={emptyDraft()} update={vi.fn()} goNext={vi.fn()} goBack={vi.fn()} />);
    for (const name of ['不用工作区', '本地文件夹', 'Git 仓库']) {
      expect(screen.getByRole('radio', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });
  it('选本地路径写入 workspace.local', async () => {
    const draft = emptyDraft();
    const update = vi.fn();
    const user = userEvent.setup();
    render(<MaterialsStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /本地文件夹/ }));
    await user.type(screen.getByLabelText('本地路径'), '/tmp/work');
    expect(update).toHaveBeenCalledWith({ workspace: { kind: 'local', path: '/tmp/work' } });
  });
  it('选 Git 写入 url + branch', async () => {
    const draft = emptyDraft();
    const update = vi.fn();
    const user = userEvent.setup();
    render(<MaterialsStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />);
    await user.click(screen.getByRole('radio', { name: /Git 仓库/ }));
    await user.type(screen.getByLabelText('Git 地址'), 'https://github.com/x/y.git');
    expect(update).toHaveBeenCalledWith({ workspace: { kind: 'git', url: 'https://github.com/x/y.git', branch: undefined } });
  });
  it('数据文件夹：添加源/目标/只读', async () => {
    const draft = emptyDraft();
    const update = vi.fn();
    const user = userEvent.setup();
    render(<MaterialsStep draft={draft} update={update} goNext={vi.fn()} goBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /加一个数据文件夹/ }));
    expect(update).toHaveBeenCalledWith({ volumes: [{ source: '', target: '', readOnly: false }] });
  });
  it('空工作区且没选材料也能继续', async () => {
    const goNext = vi.fn();
    const user = userEvent.setup();
    render(<MaterialsStep draft={emptyDraft()} update={vi.fn()} goNext={goNext} goBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '继续' }));
    expect(goNext).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/ui/steps/ScheduleStep.test.tsx src/ui/steps/MaterialsStep.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `src/ui/steps/ScheduleStep.tsx`：

```tsx
import { useState } from 'react';
import type { ScheduleInput } from '../../domain/schedule';
import { describeSchedule } from '../../domain/schedule';
import type { WizardStepProps } from './WizardStepProps';

const WEEK_OPTIONS = [
  { value: 1, label: '周一' }, { value: 2, label: '周二' }, { value: 3, label: '周三' },
  { value: 4, label: '周四' }, { value: 5, label: '周五' }, { value: 6, label: '周六' }, { value: 0, label: '周日' },
];

type Mode = 'manual' | 'scheduled' | 'interval';
function modeOf(s: ScheduleInput): Mode {
  return s.kind === 'manual' ? 'manual' : s.kind === 'interval' ? 'interval' : 'scheduled';
}

export function ScheduleStep({ draft, update, goNext }: WizardStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const mode = modeOf(draft.schedule);

  function setMode(next: Mode) {
    if (next === 'manual') update({ schedule: { kind: 'manual' } });
    else if (next === 'interval') update({ schedule: { kind: 'interval', minutes: 30 } });
    else update({ schedule: { kind: 'daily', hour: 9, minute: 0 } });
  }

  function next() {
    if (mode === 'interval' && draft.schedule.kind === 'interval' && draft.schedule.minutes <= 0) {
      setError('间隔要大于 0 分钟。');
      return;
    }
    goNext();
  }

  const sched = draft.schedule;

  return (
    <section aria-label="什么时候干活">
      <h2>什么时候让它干活？</h2>
      <fieldset>
        <legend className="sr-only">触发方式</legend>
        <label className="engine-card">
          <input type="radio" name="mode" checked={mode === 'manual'} onChange={() => setMode('manual')} />
          <strong>手动</strong><span>我点「立即运行」它才干活</span>
        </label>
        <label className="engine-card">
          <input type="radio" name="mode" checked={mode === 'scheduled'} onChange={() => setMode('scheduled')} />
          <strong>定时</strong><span>每天或每周固定时间自动干</span>
        </label>
        <label className="engine-card">
          <input type="radio" name="mode" checked={mode === 'interval'} onChange={() => setMode('interval')} />
          <strong>固定间隔</strong><span>每隔一段时间自动干一次</span>
        </label>
      </fieldset>

      {mode === 'scheduled' && (sched.kind === 'daily' || sched.kind === 'weekly') && (
        <fieldset>
          <legend>定时间隔</legend>
          <label>
            <input type="radio" name="submode" checked={sched.kind === 'daily'} onChange={() => update({ schedule: { kind: 'daily', hour: 9, minute: 0 } })} />
            每天
          </label>
          <label>
            <input type="radio" name="submode" checked={sched.kind === 'weekly'} onChange={() => update({ schedule: { kind: 'weekly', days: [1], hour: 9, minute: 0 } })} />
            每周
          </label>
          {sched.kind === 'weekly' && (
            <div className="week-picker">
              {WEEK_OPTIONS.map((w) => (
                <label key={w.value}>
                  <input
                    type="checkbox"
                    checked={sched.days.includes(w.value)}
                    onChange={(e) => {
                      const days = e.target.checked
                        ? [...new Set([...sched.days, w.value])].sort()
                        : sched.days.filter((d) => d !== w.value);
                      update({ schedule: { ...sched, days } });
                    }}
                  />
                  {w.label}
                </label>
              ))}
            </div>
          )}
          <label htmlFor="sched-hour">几点</label>
          <input id="sched-hour" type="number" min={0} max={23} value={sched.hour} onChange={(e) => update({ schedule: { ...sched, hour: Number(e.target.value) } })} />
          <label htmlFor="sched-minute">几分</label>
          <input id="sched-minute" type="number" min={0} max={59} value={sched.minute} onChange={(e) => update({ schedule: { ...sched, minute: Number(e.target.value) } })} />
        </fieldset>
      )}

      {mode === 'interval' && sched.kind === 'interval' && (
        <label htmlFor="sched-interval">间隔分钟数</label>
      )}
      {mode === 'interval' && sched.kind === 'interval' && (
        <input id="sched-interval" type="number" min={1} value={sched.minutes} onChange={(e) => update({ schedule: { ...sched, minutes: Number(e.target.value) } })} />
      )}

      <p className="agent-card__meta">当前选择：{describeSchedule(draft.schedule)}</p>
      {error && <p role="alert">{error}</p>}

      <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setShowAdvanced((v) => !v)}>
        {showAdvanced ? '收起高级设置' : '高级设置'}
      </button>
      {showAdvanced && (
        <div className="wizard-advanced">
          <label htmlFor="sched-timeout">超时分钟数（可选）</label>
          <input
            id="sched-timeout"
            type="number"
            min={1}
            value={draft.timeoutMinutes ?? ''}
            placeholder="留空用默认"
            onChange={(e) => update({ timeoutMinutes: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
      )}
      <div className="wizard-nav">
        <button type="button" className="setup-btn" onClick={next}>继续</button>
      </div>
    </section>
  );
}
```

创建 `src/ui/steps/MaterialsStep.tsx`：

```tsx
import { useState } from 'react';
import type { WizardStepProps } from './WizardStepProps';

export function MaterialsStep({ draft, update, goNext }: WizardStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const kind = draft.workspace.kind;

  function next() {
    if (kind === 'local' && !draft.workspace.path.trim()) {
      setError('本地文件夹要填路径。');
      return;
    }
    if (kind === 'git' && !draft.workspace.url.trim()) {
      setError('Git 地址要填完整（https:// 开头）。');
      return;
    }
    goNext();
  }

  return (
    <section aria-label="工作材料">
      <h2>给它什么工作材料？</h2>
      <fieldset>
        <legend className="sr-only">工作区</legend>
        <label className="engine-card">
          <input type="radio" name="ws" checked={kind === 'none'} onChange={() => update({ workspace: { kind: 'none' } })} />
          <strong>不用工作区</strong><span>它只在自己的隔离工作台里干活</span>
        </label>
        <label className="engine-card">
          <input type="radio" name="ws" checked={kind === 'local'} onChange={() => update({ workspace: { kind: 'local', path: '' } })} />
          <strong>本地文件夹</strong><span>给它一个你电脑上的文件夹</span>
        </label>
        <label className="engine-card">
          <input type="radio" name="ws" checked={kind === 'git'} onChange={() => update({ workspace: { kind: 'git', url: '' } })} />
          <strong>Git 仓库</strong><span>克隆一个仓库作为材料</span>
        </label>
      </fieldset>

      {kind === 'local' && (
        <label htmlFor="ws-path">本地路径</label>
      )}
      {kind === 'local' && (
        <input id="ws-path" type="text" value={draft.workspace.path} onChange={(e) => update({ workspace: { ...draft.workspace, path: e.target.value } })} />
      )}
      {kind === 'git' && (
        <label htmlFor="ws-url">Git 地址</label>
      )}
      {kind === 'git' && (
        <input id="ws-url" type="text" value={draft.workspace.url} onChange={(e) => update({ workspace: { ...draft.workspace, url: e.target.value } })} />
      )}
      {kind === 'git' && (
        <label htmlFor="ws-branch">分支（可留空）</label>
      )}
      {kind === 'git' && (
        <input id="ws-branch" type="text" value={draft.workspace.branch ?? ''} onChange={(e) => update({ workspace: { ...draft.workspace, branch: e.target.value || undefined } })} />
      )}

      <h3>数据文件夹</h3>
      {draft.volumes.map((v, i) => (
        <div key={i} className="volume-row">
          <input aria-label="数据源" value={v.source} onChange={(e) => {
            const volumes = draft.volumes.map((x, j) => (j === i ? { ...x, source: e.target.value } : x));
            update({ volumes });
          }} />
          <input aria-label="目标路径" value={v.target} onChange={(e) => {
            const volumes = draft.volumes.map((x, j) => (j === i ? { ...x, target: e.target.value } : x));
            update({ volumes });
          }} />
          <label>
            <input type="checkbox" checked={v.readOnly} onChange={(e) => {
              const volumes = draft.volumes.map((x, j) => (j === i ? { ...x, readOnly: e.target.checked } : x));
              update({ volumes });
            }} />
            只读
          </label>
          <button type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ volumes: draft.volumes.filter((_, j) => j !== i) })}>删</button>
        </div>
      ))}
      <button type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ volumes: [...draft.volumes, { source: '', target: '', readOnly: false }] })}>
        + 加一个数据文件夹
      </button>

      <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setShowAdvanced((v) => !v)}>
        {showAdvanced ? '收起高级设置' : '高级设置'}
      </button>
      {showAdvanced && (
        <div className="wizard-advanced">
          <h4>插件（MCP）</h4>
          {draft.mcpServers.map((m, i) => (
            <div key={i} className="mcp-row">
              <input aria-label="插件名" value={m.name} onChange={(e) => update({ mcpServers: draft.mcpServers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input aria-label="插件地址" value={m.url ?? ''} onChange={(e) => update({ mcpServers: draft.mcpServers.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ mcpServers: draft.mcpServers.filter((_, j) => j !== i) })}>删</button>
            </div>
          ))}
          <button type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ mcpServers: [...draft.mcpServers, { name: '', type: 'remote', url: '' }] })}>+ 插件</button>
          <h4>技能包</h4>
          {draft.skills.map((k, i) => (
            <div key={i} className="skill-row">
              <input aria-label="技能包名" value={k.name} onChange={(e) => update({ skills: draft.skills.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ skills: draft.skills.filter((_, j) => j !== i) })}>删</button>
            </div>
          ))}
          <button type="button" className="setup-btn setup-btn--ghost" onClick={() => update({ skills: [...draft.skills, { name: '' }] })}>+ 技能包</button>
          <label>
            <input type="checkbox" checked={draft.jupyterEnabled} onChange={(e) => update({ jupyterEnabled: e.target.checked })} />
            启用 Jupyter
          </label>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="wizard-nav">
        <button type="button" className="setup-btn" onClick={next}>继续</button>
      </div>
    </section>
  );
}
```

修改 `src/ui/CreateWizard.tsx` 接上 step 2/3：

```tsx
      {step === 2 && <ScheduleStep draft={draft} update={update} goNext={goNext} goBack={goBack} />}
      {step === 3 && <MaterialsStep draft={draft} update={update} goNext={goNext} goBack={goBack} />}
```

（import 顶部加两个 Step。）

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/ui/steps/ScheduleStep.test.tsx src/ui/steps/MaterialsStep.test.tsx && npm run build && npm run lint`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add src/ui/steps/ScheduleStep.tsx src/ui/steps/ScheduleStep.test.tsx src/ui/steps/MaterialsStep.tsx src/ui/steps/MaterialsStep.test.tsx src/ui/CreateWizard.tsx
git commit -m "feat: 触发方式/工作材料步"
```

---

### Task 11: 确认步 + 保存/编辑/测试运行 + 全流程

**Files:**
- Create: `src/ui/steps/ConfirmStep.tsx`
- Test: `src/ui/steps/ConfirmStep.test.tsx`
- Modify: `src/ui/CreateWizard.tsx`（接上 step===4；实现保存/测试运行/编辑保存逻辑）
- Test: `src/ui/CreateWizard.test.tsx`（新建，含全流程 + 编辑回填用例）

**Interfaces:**
- Consumes: `draftToProjectSpec`/`issuePathToStep`（projectSpec.ts）；`draftToComposeYaml`（composeYaml.ts）；`describeSchedule`（schedule.ts）；`validateProject`/`applyProject`/`startAgentRun`/`getProject`（projects.ts）；`loadConnectionSettings`（connection.ts）；`useNavigate`/`useParams`（react-router）；`useQueryClient`。
- Produces: `ConfirmStep({draft, issues, busy, update, onTestRun, onSave, onJumpTo})`、`CreateWizard` 的完整保存/编辑/测试运行闭环。

- [ ] **Step 1: 写失败测试**

创建 `src/ui/steps/ConfirmStep.test.tsx`：

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyDraft } from '../../domain/agentDraft';
import { ConfirmStep } from './ConfirmStep';

const draft = {
  ...emptyDraft(),
  provider: 'codex',
  name: 'my bot',
  displayName: '我的机器人',
  prompt: '整理日志',
  schedule: { kind: 'interval', minutes: 90 } as const,
};

describe('ConfirmStep', () => {
  it('展示人话摘要 + YAML 预览', () => {
    render(<ConfirmStep draft={draft} issues={[]} busy={false} update={vi.fn()} onTestRun={vi.fn()} onSave={vi.fn()} onJumpTo={vi.fn()} />);
    expect(screen.getByText('我的机器人')).toBeInTheDocument();
    expect(screen.getByText(/每 1 小时 30 分钟一次/)).toBeInTheDocument();
    expect(screen.getByText('codex', { selector: 'dd' })).toBeInTheDocument();
    const yaml = screen.getByRole('region', { name: /YAML 预览/ });
    expect(yaml).toHaveTextContent('provider: codex');
  });
  it('保存按钮触发 onSave；测试运行按钮触发 onTestRun', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onTestRun = vi.fn();
    render(<ConfirmStep draft={draft} issues={[]} busy={false} update={vi.fn()} onTestRun={onTestRun} onSave={onSave} onJumpTo={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /保存/ }));
    expect(onSave).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /测试运行一次/ }));
    expect(onTestRun).toHaveBeenCalled();
  });
  it('校验 issues 人话展示并可按步骤回跳', async () => {
    const user = userEvent.setup();
    const onJumpTo = vi.fn();
    render(
      <ConfirmStep
        draft={draft}
        issues={[{ severity: 2, path: 'agents.0.provider', message: 'provider 不支持' }]}
        busy={false}
        update={vi.fn()}
        onTestRun={vi.fn()}
        onSave={vi.fn()}
        onJumpTo={onJumpTo}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/provider 不支持/);
    await user.click(screen.getByRole('button', { name: /回第 1 步/ }));
    expect(onJumpTo).toHaveBeenCalledWith(0);
  });
});
```

创建 `src/ui/CreateWizard.test.tsx`（全流程 + 编辑回填）：

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { CreateWizard } from './CreateWizard';

const validateProjectMock = vi.fn();
const applyProjectMock = vi.fn();
const startAgentRunMock = vi.fn();
const getProjectMock = vi.fn();

vi.mock('../api/projects', () => ({
  validateProject: (...a: unknown[]) => validateProjectMock(...a),
  applyProject: (...a: unknown[]) => applyProjectMock(...a),
  startAgentRun: (...a: unknown[]) => startAgentRunMock(...a),
  getProject: (...a: unknown[]) => getProjectMock(...a),
  projectRefByName: (name: string) => ({ case: 'name', value: name }),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

function renderWizard(path = '/console/agents/new') {
  return renderWithClient(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/agents/new" element={<CreateWizard />} />
        <Route path="/console/agents/:agentName/edit" element={<CreateWizard />} />
        <Route path="/console/agents" element={<div>agents list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function walkToConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '继续' })); // step0 引擎（默认 claude）
  await user.type(screen.getByLabelText('任务说明'), '整理日志');
  await user.click(screen.getByRole('button', { name: '继续' }));
  await user.click(screen.getByRole('radio', { name: /固定间隔/ })); // step2 固定间隔（默认 30 分钟）
  await user.click(screen.getByRole('button', { name: '继续' }));
  await user.click(screen.getByRole('button', { name: '继续' })); // step3 材料（默认无）
  await user.type(screen.getByLabelText('AI 助手名字'), '我的机器人');
}

describe('CreateWizard 全流程', () => {
  beforeEach(() => {
    validateProjectMock.mockReset().mockResolvedValue({ valid: true, issues: [] });
    applyProjectMock.mockReset().mockResolvedValue({ applied: true, issues: [], project: { summary: { projectId: 'p1' } } });
    startAgentRunMock.mockReset().mockResolvedValue({ run: { runId: 'r1' } });
    getProjectMock.mockReset();
  });
  it('新建：走完 5 步，保存先 Validate 再 Apply，然后回到列表', async () => {
    const user = userEvent.setup();
    renderWizard();
    await walkToConfirm(user);
    expect(screen.getByText('我的机器人')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(validateProjectMock).toHaveBeenCalled());
    await waitFor(() => expect(applyProjectMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('agents list')).toBeInTheDocument());
  });
  it('校验失败给人话提示并停在确认页', async () => {
    validateProjectMock.mockResolvedValue({ valid: false, issues: [{ severity: 2, path: 'agents.0.provider', message: 'provider 不支持' }] });
    const user = userEvent.setup();
    renderWizard();
    await walkToConfirm(user);
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/provider 不支持/));
    expect(applyProjectMock).not.toHaveBeenCalled();
  });
  it('测试运行一次：Validate+Apply 后调 StartAgentRun 并跳运行记录', async () => {
    const user = userEvent.setup();
    renderWizard();
    await walkToConfirm(user);
    await user.click(screen.getByRole('button', { name: /测试运行一次/ }));
    await waitFor(() => expect(startAgentRunMock).toHaveBeenCalled());
  });
  it('编辑：GetProject 回填草稿，标题为「编辑 AI 助手」', async () => {
    getProjectMock.mockResolvedValue({
      project: {
        summary: { projectId: 'p1', name: 'my-bot' },
        spec: {
          name: 'my-bot',
          agents: [{ name: 'my-bot', provider: 'codex', model: 'gpt-5', systemPrompt: '', displayName: '我的机器人', description: '', enabled: true, env: [], scheduler: undefined, workspace: undefined, volumes: [], mcpServers: [], skills: [], jupyter: undefined }],
        },
      },
    });
    const user = userEvent.setup();
    renderWizard('/console/agents/my-bot/edit');
    await waitFor(() => expect(screen.getByRole('heading', { name: '编辑 AI 助手' })).toBeInTheDocument());
    expect(screen.getByText('我的机器人')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/ui/steps/ConfirmStep.test.tsx src/ui/CreateWizard.test.tsx`
Expected: FAIL（ConfirmStep 不存在 / CreateWizard 尚未接保存逻辑）

- [ ] **Step 3: 实现**

创建 `src/ui/steps/ConfirmStep.tsx`：

```tsx
import { describeSchedule } from '../../domain/schedule';
import { draftToComposeYaml } from '../../domain/composeYaml';
import { issuePathToStep } from '../../domain/projectSpec';
import type { AgentDraft } from '../../domain/agentDraft';

export interface ConfirmIssue {
  severity: number;
  path: string;
  message: string;
}

interface Props {
  draft: AgentDraft;
  issues: ConfirmIssue[];
  busy: boolean;
  update: (patch: Partial<AgentDraft>) => void;
  onTestRun: () => void;
  onSave: () => void;
  onJumpTo: (step: number) => void;
}

export function ConfirmStep({ draft, issues, busy, update, onTestRun, onSave, onJumpTo }: Props) {
  const yaml = draftToComposeYaml({ ...draft, name: draft.name || draft.displayName });
  return (
    <section aria-label="确认创建">
      <h2>确认一下</h2>
      <label htmlFor="confirm-name">AI 助手名字</label>
      <input
        id="confirm-name"
        type="text"
        value={draft.displayName}
        onChange={(e) => update({ displayName: e.target.value })}
      />
      <dl className="confirm-summary">
        <dt>名字</dt><dd>{draft.displayName}</dd>
        <dt>AI 引擎</dt><dd>{draft.provider}</dd>
        <dt>什么时候干活</dt><dd>{describeSchedule(draft.schedule)}</dd>
        <dt>任务说明</dt><dd>{draft.prompt}</dd>
        <dt>工作材料</dt>
        <dd>
          {draft.workspace.kind === 'local' ? `本地：${draft.workspace.path}` : draft.workspace.kind === 'git' ? `Git：${draft.workspace.url}` : '隔离工作台'}
        </dd>
      </dl>
      {issues.length > 0 && (
        <div role="alert" className="confirm-issues">
          {issues.map((issue, i) => (
            <p key={i}>
              {issue.message}
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => onJumpTo(issuePathToStep(issue.path))}>
                回第 {issuePathToStep(issue.path) + 1} 步修改
              </button>
            </p>
          ))}
        </div>
      )}
      <details role="region" aria-label="YAML 预览">
        <summary>YAML 预览</summary>
        <pre>{yaml}</pre>
      </details>
      <div className="wizard-nav">
        <button type="button" className="setup-btn" disabled={busy} onClick={onTestRun}>测试运行一次</button>
        <button type="button" className="setup-btn" disabled={busy} onClick={onSave}>保存</button>
      </div>
    </section>
  );
}
```

修改 `src/ui/CreateWizard.tsx` 完整版（接入 step 4 + 保存/测试运行/编辑）：

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import { applyProject, getProject, startAgentRun, validateProject } from '../api/projects';
import { projectSpecToDraft, draftToProjectSpec } from '../domain/projectSpec';
import { emptyDraft, type AgentDraft } from '../domain/agentDraft';
import { useSetupWizard } from '../hooks/useSetupWizard';
import { CREATE_STEPS } from './createWizardSteps';
import { WizardStepBar } from './WizardStepBar';
import { EngineStep } from './steps/EngineStep';
import { TaskStep } from './steps/TaskStep';
import { ScheduleStep } from './steps/ScheduleStep';
import { MaterialsStep } from './steps/MaterialsStep';
import { ConfirmStep, type ConfirmIssue } from './steps/ConfirmStep';

export function CreateWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { agentName } = useParams();
  const editing = Boolean(agentName);
  const { step, goNext, goBack, goTo } = useSetupWizard(CREATE_STEPS.length);
  const [draft, setDraft] = useState<AgentDraft>(emptyDraft());
  const [issues, setIssues] = useState<ConfirmIssue[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: loaded, isError } = useQuery({
    queryKey: ['project-for-edit', agentName],
    queryFn: async () => {
      const s = loadConnectionSettings();
      const project = await getProject(s, { case: 'name', value: agentName! }, true);
      if (!project?.spec) return null;
      return projectSpecToDraft(project.spec, agentName!);
    },
    enabled: editing,
  });

  useEffect(() => {
    if (loaded) setDraft(loaded);
  }, [loaded]);

  const update = (patch: Partial<AgentDraft>) => setDraft((d) => ({ ...d, ...patch }));

  async function saveAndRun(runAfter: boolean) {
    setBusy(true);
    setIssues([]);
    const s = loadConnectionSettings();
    const spec = draftToProjectSpec(draft);
    const vres = await validateProject(s, spec);
    if (!vres.valid) {
      setIssues(vres.issues);
      setBusy(false);
      return;
    }
    const ares = await applyProject(s, spec);
    if (ares.issues.length > 0) {
      setIssues(ares.issues);
      setBusy(false);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['agents'] });
    if (runAfter) {
      const pid = ares.project?.summary?.projectId ?? '';
      await startAgentRun(s, { projectId: pid, agentName: spec.name, prompt: draft.prompt });
      navigate('/console/runs');
    } else {
      navigate('/console/agents');
    }
  }

  if (editing && isError) return <p role="alert">找不到这个 AI 助手。</p>;

  return (
    <main className="wizard-shell">
      <h1>{editing ? '编辑 AI 助手' : '新建 AI 助手'}</h1>
      <WizardStepBar steps={CREATE_STEPS} currentStep={step} onStepClick={goTo} />
      {step > 0 && (
        <button type="button" className="setup-back" onClick={goBack}>← 上一步</button>
      )}
      {step === 0 && <EngineStep draft={draft} update={update} goNext={goNext} goBack={goBack} />}
      {step === 1 && <TaskStep draft={draft} update={update} goNext={goNext} goBack={goBack} />}
      {step === 2 && <ScheduleStep draft={draft} update={update} goNext={goNext} goBack={goBack} />}
      {step === 3 && <MaterialsStep draft={draft} update={update} goNext={goNext} goBack={goBack} />}
      {step === 4 && (
        <ConfirmStep
          draft={draft}
          issues={issues}
          busy={busy}
          update={update}
          onJumpTo={goTo}
          onTestRun={() => void saveAndRun(true)}
          onSave={() => void saveAndRun(false)}
        />
      )}
    </main>
  );
}
```

> 注：`applyProject` 返回 `{ applied, issues, project? }`（Task 4 已扩），测试运行用 `ares.project.summary.projectId` 做 `StartAgentRun` 的项目引用。
> 注：`slugify(displayName)` 对纯中文名会退化为 `'assistant'`（`slugify` 只保留 a-z0-9）。非 ASCII 显示名会产生 `assistant` 作为项目/agent 键——单机可用但多 agent 会撞名。Phase 3 保持此行为，列表页 key 用 `projectId:agentName` 消歧；slug 生成器改进（加序号后缀）留待设置页/后续阶段。

- [ ] **Step 4: 运行确认绿**

Run: `npx vitest run src/ui/steps/ConfirmStep.test.tsx src/ui/CreateWizard.test.tsx && npm run build && npm run lint`
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add src/ui/steps/ConfirmStep.tsx src/ui/steps/ConfirmStep.test.tsx src/ui/CreateWizard.tsx src/ui/CreateWizard.test.tsx src/api/projects.ts src/api/projects.test.ts
git commit -m "feat: 确认步 + 保存/测试运行/编辑闭环"
```

---

### Task 12: 控制台路由骨架 + 占位页 + App 接线

**Files:**
- Create: `src/ui/placeholders.tsx`
- Modify: `src/App.tsx`（Routes：`/` → `/console`；`/console` 嵌套 agents / agents/new / agents/:agentName/edit / runs / resources / settings 占位）
- Test: `src/App.test.tsx`（追加路由级用例：在线时 `/console/agents` 渲染 AgentListScreen；`/console/settings` 渲染占位）

**Interfaces:**
- Consumes: `ConsoleLayout`、`AgentListScreen`（Task 8）、`CreateWizard`（Task 11）、`PagePlaceholder`。
- Produces: 完整 `App` 路由。

- [ ] **Step 1: 写失败测试**

创建 `src/ui/placeholders.tsx`：

```tsx
export function PagePlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <section className="console-page">
      <h2>{title}</h2>
      <p>{note}</p>
    </section>
  );
}
```

在 `src/App.test.tsx` 顶部补两个组件 mock（App 已 import 真实组件，真实组件又触发 `useAgents` 网络查询；mock 掉它们后 App 路由仍照常渲染，只是内容换成 stub 文本），并追加两个用例。由于 App 用 `BrowserRouter`（jsdom URL 为 `/`），无法直接控制初始路径——用 `window.history.replaceState` 在渲染前跳到目标路径，渲染后 await：

```tsx
vi.mock('./ui/AgentListScreen', () => ({ AgentListScreen: () => <div>AgentListScreen stub</div> }));
vi.mock('./ui/CreateWizard', () => ({ CreateWizard: () => <div>CreateWizard stub</div> }));

  it('在线时 /console/agents 渲染 Agent 列表路由', async () => {
    window.history.replaceState({}, '', '/console/agents');
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() => expect(screen.getByText('AgentListScreen stub')).toBeInTheDocument());
  });
  it('在线时 /console/settings 渲染占位页', async () => {
    window.history.replaceState({}, '', '/console/settings');
    probeMock.mockResolvedValue('ok');
    render(<App />);
    await waitFor(() => expect(screen.getByText('设置（下个阶段）')).toBeInTheDocument());
  });
```

- [ ] **Step 2: 运行确认红**

Run: `npx vitest run src/App.test.tsx`
Expected: 新增用例红（路由未实现）

- [ ] **Step 3: 实现**

修改 `src/App.tsx`：

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useDaemonProbe } from './hooks/useDaemonProbe';
import { queryClient } from './lib/queryClient';
import { SetupShell } from './ui/SetupShell';
import { ConsoleLayout } from './ui/ConsoleLayout';
import { AgentListScreen } from './ui/AgentListScreen';
import { CreateWizard } from './ui/CreateWizard';
import { PagePlaceholder } from './ui/placeholders';

export default function App() {
  const { state } = useDaemonProbe();

  if (state === 'probing') {
    return <div role="status">正在寻找你电脑上的 agent-compose…</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {state === 'offline' ? (
          <SetupShell />
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to="/console" replace />} />
            <Route path="/console" element={<ConsoleLayout />}>
              <Route index element={<PagePlaceholder title="首页" note="运行概览在这里（下个阶段）" />} />
              <Route path="agents" element={<AgentListScreen />} />
              <Route path="agents/new" element={<CreateWizard />} />
              <Route path="agents/:agentName/edit" element={<CreateWizard />} />
              <Route path="runs" element={<PagePlaceholder title="运行记录" note="运行日志与事件时间线在这里（下个阶段）" />} />
              <Route path="resources" element={<PagePlaceholder title="资源中心" note="工作区/数据文件夹/插件/沙箱在这里（下个阶段）" />} />
              <Route path="settings" element={<PagePlaceholder title="设置（下个阶段）" note="密钥、全局环境变量与进阶配置在这里" />} />
              <Route path="*" element={<Navigate to="/console" replace />} />
            </Route>
          </Routes>
        )}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

> 注意：`AgentListScreen`/`CreateWizard` 被真实 App 引用后，App.test 顶部需 mock 它们（上面已写）；但 `ConsoleLayout.test` 不渲染 App，不受影响。`navItems.ts` 的 `/console/runs` 等链接现在都有占位页兜底。

- [ ] **Step 4: 运行确认绿 + 全量回归**

Run: `npx vitest run && npm run build && npm run lint`
Expected: 全绿（77 个既有 + 新增全部通过）

- [ ] **Step 5: 提交**

```bash
git add src/App.tsx src/App.test.tsx src/ui/placeholders.tsx
git commit -m "feat: 控制台路由骨架与占位页"
```

---

## 自审（Spec 对照）

- **§5.2 我的 Agent** → T8 `AgentListScreen` + `AgentCard`（引擎 logo/名称/状态徽章/下次运行/最近结果；立即运行、暂停/启用、编辑、查看日志、删除；无批量操作；「+ 新建」进向导）。✅
- **§5.2 状态徽章（工作中/已暂停/出错）** → T2 `agentCardStatus`（working > paused > errored > idle）。✅
- **§5.2 下次运行时间** → T4 `getSchedulerNextFire` + T7 `useAgents`（裁决表 3）。✅
- **§6 5 步向导 + 顶部分步条 + 编辑复用回填** → T9-T11 `CreateWizard`（引擎/任务/触发/材料/确认；编辑态经 GetProject 回填）。✅
- **§6 保存流程 Validate→Apply + 字段级定位** → T11（`issuePathToStep` + 确认页「回第 N 步」）。✅
- **§6 测试运行一次 → StartAgentRun** → T11（先 Apply 拿 projectId 再 Run，裁决表 5）。✅
- **§6 模型从 capability catalog 选择或自由填写** → 裁决表 4：Phase 3 自由文本，catalog 留设置页。⚠️ 明确非本阶段目标。
- **§8 React Query 缓存与失效** → T5（`@tanstack/react-query` + `queryClient`）。✅
- **§8 流式接口独立订阅 hook** → 留待 Phase 4（Dashboard 用），本阶段用 ListProjects+GetProject。⚠️ 明确非本阶段目标。
- **§8 任何 401 统一弹回登录浮层** → T3（interceptor 派发事件）+ T6（`AuthOverlay`）。✅
- **§10.1 网络/daemon 不在线兜底** → 既有 `useDaemonProbe`（App 世界切换）承担；列表页错误态给人话 + 重试（T8）。✅
- **§10.3 运行期失败卡片告警** → T2 `agentCardStatus` errored + `runStatusLabel`（卡片「出了点问题」）。✅
- **§7 文案转译** → 全程人话（AI 助手/引擎/什么时候干活/工作材料/插件/技能包）。✅
- **Phase 2 遗留**：`errorKind`/`checkAccess` 统一 → T3 `classifyError` ✅；401 浮层 → T6 ✅；badge 刷新 → 列表页每次操作后 `invalidateQueries(['agents'])` ✅；`ProviderKeyEnvVar` 类型漂移 → 不在本阶段（设置页 Phase 5 处理，保留 defer）。

## 计划文件结构

```
src/api/classify.ts, classify.test.ts        # T3 统一错误分类
src/api/projects.ts, projects.test.ts        # T4 项目/运行 API
src/domain/projectSpec.ts, test.ts           # T1 draft⇄spec 映射
src/domain/agentCard.ts, test.ts             # T2 卡片模型
src/lib/queryClient.ts, test.tsx             # T5 React Query 单例
src/test/renderWithClient.tsx                # T5 测试助手
src/hooks/useAgents.ts, test.tsx             # T7 列表数据
src/ui/AuthOverlay.tsx, test.tsx             # T6 401 浮层
src/ui/AgentCard.tsx, test.tsx               # T8 卡片
src/ui/AgentListScreen.tsx, test.tsx         # T8 列表页
src/ui/createWizardSteps.ts                  # T9 步名
src/ui/WizardStepBar.tsx, test.tsx           # T9 泛化步条
src/ui/steps/{WizardStepProps,EngineStep,TaskStep,ScheduleStep,MaterialsStep,ConfirmStep}.tsx + tests  # T9-T11
src/ui/CreateWizard.tsx, test.tsx            # T9-T11 向导壳+闭环
src/ui/placeholders.tsx                      # T12 占位页
src/ui/console.css                           # T8 最低样式
src/domain/agentDraft.ts (emptyDraft)        # T9 追加
src/api/connection.ts / settings.ts          # T3 401 事件 + classify
src/App.tsx, App.test.tsx                    # T5/T12 接线 + 路由
src/ui/ConsoleLayout.tsx, test.tsx           # T6 挂 AuthOverlay
```

## Global Constraints（复用确认）

- 不修改 `src/api/gen/**`；新增依赖仅 `@tanstack/react-query@^5`。
- `npm run build` / `npm run lint` 全绿；测试全绿。
- 文案转译用 `labels.ts` TERMS + 转译表；Provider 仅 4 个。
- 401 全局弹回登录浮层；凭据存 localStorage。
- TDD 红→绿；每任务提交。
