import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import { getCapabilityCatalog, getCapabilityStatus, listCapabilitySets } from '../api/resources';
import { getProject, listProjects, projectRefById } from '../api/projects';
import type { CapabilitySet } from '../api/gen/agentcompose/v2/agentcompose_pb';
import './console.css';

export function PluginLibraryTab() {
  const s = loadConnectionSettings();
  const setsQuery = useQuery({ queryKey: ['capability-sets'], queryFn: () => listCapabilitySets(s) });
  const statusQuery = useQuery({ queryKey: ['capability-status'], queryFn: () => getCapabilityStatus(s) });
  const usageQuery = useQuery({
    queryKey: ['capability-usage'],
    queryFn: async () => {
      const summaries = await listProjects(s);
      const projects = (
        await Promise.all(summaries.map((p) => getProject(s, projectRefById(p.projectId), true).catch(() => undefined)))
      ).filter((p): p is NonNullable<typeof p> => Boolean(p));
      const rows: { projectName: string; agentName: string; displayName: string; mcp: string[]; skills: string[] }[] = [];
      for (const proj of projects) {
        for (const a of proj.spec?.agents ?? []) {
          rows.push({ projectName: proj.summary?.name ?? proj.summary?.projectId ?? '', agentName: a.name, displayName: a.displayName, mcp: a.mcpServers?.map((m) => m.name) ?? [], skills: a.skills?.map((s) => s.name) ?? [] });
        }
      }
      return rows;
    },
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const catalogQuery = useQuery({
    queryKey: ['capability-catalog'],
    queryFn: () => getCapabilityCatalog(s, Array.from(expanded)[0] ?? ''),
    enabled: expanded.size > 0,
  });

  if (setsQuery.isLoading) return <p role="status">正在加载插件库…</p>;
  if (setsQuery.isError) return <p role="alert">连不上 agent-compose，加载失败。</p>;
  const sets = setsQuery.data ?? [];
  const status = statusQuery.data;
  const usage = usageQuery.data ?? [];

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else { next.clear(); next.add(id); }
    setExpanded(next);
  };

  return (
    <div className="res-section">
      <div className="run-section__head">
        <h3>技能包能力集</h3>
        {status && <span className={`res-capstatus${status.ok ? ' res-capstatus--ok' : ''}`}>{status.ok ? '网关就绪' : '网关未就绪'}</span>}
      </div>
      {sets.length === 0 ? (
        <p className="run-section__empty">没有可用的技能包。</p>
      ) : (
        <div className="res-plugin-list">
          {sets.map((set: CapabilitySet) => (
            <div key={set.id} className="res-plugin">
              <button type="button" className="res-plugin__head" aria-expanded={expanded.has(set.id)} onClick={() => toggle(set.id)}>
                <span>{set.name}</span>
                {set.enabled ? <span className="run-status run-status--running">已启用</span> : <span className="run-status run-status--stopped">未启用</span>}
              </button>
              {set.description && <p className="res-plugin__desc">{set.description}</p>}
              {expanded.has(set.id) && (
                <div className="res-plugin__methods">
                  {(catalogQuery.data?.methods ?? []).map((m) => (
                    <span key={m.methodFullName} className="res-plugin__method">{m.methodFullName}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="run-section__head" style={{ marginTop: 24 }}>
        <h3>在用插件与技能</h3>
      </div>
      {usage.length === 0 ? (
        <p className="run-section__empty">还没有助手用到插件或技能包。</p>
      ) : (
        <table className="runs-table">
          <thead><tr><th>助手</th><th>所属项目</th><th>插件（MCP）</th><th>技能包</th></tr></thead>
          <tbody>
            {usage.map((r) => (
              <tr key={`${r.projectName}:${r.agentName}`}>
                <td>{r.displayName || r.agentName}</td>
                <td>{r.projectName}</td>
                <td>{r.mcp.length > 0 ? r.mcp.join('、') : '—'}</td>
                <td>{r.skills.length > 0 ? r.skills.join('、') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
