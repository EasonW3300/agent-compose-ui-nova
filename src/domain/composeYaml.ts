// js-yaml v5 仅提供命名导出（无 default 导出），故使用具名导入。
import { dump } from 'js-yaml';
import { slugify, buildTriggers, type AgentDraft } from './agentDraft';

export function composeToObject(draft: AgentDraft): Record<string, unknown> {
  const agent: Record<string, unknown> = {};
  agent.enabled = true;
  agent.display_name = draft.displayName;
  if (draft.description) agent.description = draft.description;
  agent.provider = draft.provider;
  if (draft.model) agent.model = draft.model;
  if (draft.systemPrompt) agent.system_prompt = draft.systemPrompt;
  if (draft.env.length > 0) {
    agent.env = Object.fromEntries(draft.env.map((e) => [e.key, e.value]));
  }
  if (draft.mcpServers.length > 0) {
    agent.mcp_servers = draft.mcpServers.map((m) => ({
      name: m.name,
      type: m.type,
      ...(m.command ? { command: m.command } : {}),
      ...(m.args && m.args.length > 0 ? { args: m.args } : {}),
      ...(m.url ? { url: m.url } : {}),
    }));
  }
  if (draft.skills.length > 0) {
    agent.skills = draft.skills.map((k) => ({
      name: k.name,
      ...(k.url ? { url: k.url } : {}),
      ...(k.ref ? { ref: k.ref } : {}),
    }));
  }
  if (draft.volumes.length > 0) {
    agent.volumes = draft.volumes.map((v) => ({
      source: v.source,
      target: v.target,
      read_only: v.readOnly,
    }));
  }
  if (draft.workspace.kind === 'local') {
    agent.workspace = { provider: 'file', path: draft.workspace.path };
  } else if (draft.workspace.kind === 'git') {
    agent.workspace = {
      provider: 'git',
      url: draft.workspace.url,
      ...(draft.workspace.branch ? { ref: draft.workspace.branch } : {}),
    };
  }
  const triggers = buildTriggers(draft.schedule, draft.timeoutMinutes);
  if (triggers) {
    agent.scheduler = {
      triggers: triggers.map((t) =>
        draft.schedule.kind === 'manual'
          ? t
          : {
              ...t,
              ...(draft.prompt ? { prompt: draft.prompt } : {}),
            },
      ),
    };
  }
  if (draft.jupyterEnabled) agent.jupyter = { enabled: true };

  return { name: slugify(draft.name), agents: { [slugify(draft.name)]: agent } };
}

export function draftToComposeYaml(draft: AgentDraft): string {
  return dump(composeToObject(draft), { lineWidth: 100, noRefs: true });
}
