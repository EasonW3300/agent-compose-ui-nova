import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { loadConnectionSettings } from '../api/connection';
import { getProject, getSchedulerNextFire, listProjects, listSchedulerEvents, projectRefById } from '../api/projects';
import { schedulerLevelTone } from '../domain/resourceView';
import './console.css';

export function SchedulerSection() {
  const navigate = useNavigate();
  const s = loadConnectionSettings();
  const overview = useQuery({
    queryKey: ['scheduler-overview'],
    queryFn: async () => {
      const summaries = await listProjects(s);
      const projects = (await Promise.all(summaries.map((p) => getProject(s, projectRefById(p.projectId), true).catch(() => undefined)))).filter((p): p is NonNullable<typeof p> => Boolean(p));
      const rows: { projectId: string; agentName: string; displayName: string; enabled: boolean; nextFireAt: Date | null }[] = [];
      for (const proj of projects) {
        const pid = proj.summary?.projectId ?? '';
        for (const ag of proj.spec?.agents ?? []) {
          const enabled = Boolean(ag.scheduler?.enabled);
          let fire: Date | null = null;
          if (enabled) { try { fire = await getSchedulerNextFire(s, projectRefById(pid), ag.name); } catch { fire = null; } }
          rows.push({ projectId: pid, agentName: ag.name, displayName: ag.displayName || ag.name, enabled, nextFireAt: fire });
        }
      }
      return rows;
    },
  });
  const events = useQuery({ queryKey: ['scheduler-events'], queryFn: () => listSchedulerEvents(s, { limit: 50 }) });

  const fmt = (d: Date | null) => (d ? `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—');

  return (
    <div className="set-section">
      <div className="run-section__head"><h3>调度总览</h3></div>
      <p className="run-section__empty">每个 AI 助手的「什么时候干活」汇总。点击可去编辑。</p>
      <table className="runs-table">
        <thead><tr><th>助手</th><th>状态</th><th>下次触发</th></tr></thead>
        <tbody>
          {(overview.data ?? []).map((r) => (
            <tr key={`${r.projectId}:${r.agentName}`} onClick={() => navigate(`/console/agents/${r.agentName}/edit`)}>
              <td>{r.displayName}</td>
              <td>{r.enabled ? <span className="run-status run-status--running">已开启</span> : <span className="run-status run-status--stopped">已暂停</span>}</td>
              <td>{fmt(r.nextFireAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="run-section__head" style={{ marginTop: 24 }}><h3>调度事件历史</h3></div>
      {(events.data ?? []).length === 0 ? (
        <p className="run-section__empty">暂无调度事件。</p>
      ) : (
        <div className="run-events">
          {(events.data ?? []).map((ev) => (
            <div key={ev.id} className="run-event">
              <span className={`set-sch-level set-sch-level--${schedulerLevelTone(ev.level)}`}>{ev.level}</span>
              <span className="run-event__text">{ev.message}{ev.runId ? `（运行 ${ev.runId}）` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
