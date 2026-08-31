import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { loadConnectionSettings } from '../api/connection';
import { listRuns } from '../api/runs';
import { runStatusTone, runToRow } from '../domain/runView';
import './console.css';

export function RunsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['runs'],
    queryFn: async () => {
      const s = loadConnectionSettings();
      return listRuns(s, { limit: 50 });
    },
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['runs'] });

  if (query.isLoading) return <div className="console-page" role="status">正在加载运行记录…</div>;
  if (query.isError) {
    return (
      <div className="console-page">
        <p role="alert">加载失败，连不上 agent-compose。</p>
        <button type="button" className="setup-btn" onClick={refresh}>重试</button>
      </div>
    );
  }
  const rows = (query.data ?? []).map(runToRow);

  return (
    <section className="console-page">
      <div className="console-page__head">
        <h2>运行记录</h2>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={refresh}>刷新</button>
      </div>
      {rows.length === 0 ? (
        <p>还没有运行记录。去「我的 AI 助手」点「立即运行」，第一个结果就会出现在这里。</p>
      ) : (
        <table className="runs-table">
          <thead>
            <tr>
              <th>AI 助手</th>
              <th>来源</th>
              <th>状态</th>
              <th>耗时</th>
              <th>开始时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} onClick={() => navigate(`/console/runs/${r.runId}`)}>
                <td>{r.agentName}</td>
                <td>{r.sourceLabel}</td>
                <td>
                  <span className={`run-status run-status--${runStatusTone(r.status)}`}>{r.statusLabel}</span>
                </td>
                <td>{r.durationText}</td>
                <td>{r.startedText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
