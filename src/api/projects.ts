import { createClient } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { createDaemonTransport, type ConnectionSettings } from './connection';
import {
  ProjectService,
  ProjectRefSchema,
  RunService,
  RunSource,
  type Project,
  type ProjectRef,
  type ProjectSpec,
  type ProjectSummary,
  type RunSummary,
  type SchedulerEvent,
} from './gen/agentcompose/v2/agentcompose_pb';

function client(s: ConnectionSettings) {
  return createClient(ProjectService, createDaemonTransport(s));
}

function runClient(s: ConnectionSettings) {
  return createClient(RunService, createDaemonTransport(s));
}

// ProjectRef 的 oneof 是 selector 字段（protobuf-es v2 的 ADT），
// 必须用 create(ProjectRefSchema, { selector: { case, value } }) 构造；
// 直接返回 { case, value } 会在序列化时丢失 oneof。
export function projectRefByName(name: string): ProjectRef {
  return create(ProjectRefSchema, { selector: { case: 'name', value: name } });
}

export function projectRefById(projectId: string): ProjectRef {
  return create(ProjectRefSchema, { selector: { case: 'projectId', value: projectId } });
}

export async function listProjects(s: ConnectionSettings): Promise<ProjectSummary[]> {
  const res = await client(s).listProjects({});
  return res.projects;
}

export async function listSchedulerEvents(s: ConnectionSettings, opts: { limit?: number } = {}): Promise<SchedulerEvent[]> {
  const res = await client(s).listSchedulerEvents({ limit: opts.limit ?? 100, offset: 0 });
  return res.events;
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
  // 当前 daemon 尚未实现物理清理运行历史；保留历史仍可删除项目并停止关联沙箱。
  await client(s).removeProject({ project: ref, removeHistory: false, stopRunningSandboxes: true });
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

/** 启动保留上下文的互动运行；后续用户消息会通过独立 RPC 写入同一 run。 */
export async function startInteractiveAgentRun(
  s: ConnectionSettings,
  run: { projectId: string; agentName: string; prompt: string },
): Promise<RunSummary> {
  // Interactive and one-shot runs share the same payload; the RPC method selects
  // the persistent conversation lifecycle while MANUAL preserves the UI trigger source.
  const res = await runClient(s).startInteractiveAgentRun({
    run: { projectId: run.projectId, agentName: run.agentName, prompt: run.prompt, source: RunSource.MANUAL },
  });
  if (!res.run) throw new Error('startInteractiveAgentRun 未返回 run');
  return res.run;
}

/** 取某 agent 调度器首个「真正有 nextFireAt 的」enabled trigger（裁决表 3）。 */
export async function getSchedulerNextFire(
  s: ConnectionSettings,
  ref: ProjectRef,
  agentName: string,
): Promise<Date | null> {
  const res = await client(s).getScheduler({ project: ref, agentName });
  const first = res.triggers.find((t) => t.enabled && t.nextFireAt);
  return first?.nextFireAt ? timestampDate(first.nextFireAt) : null;
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
