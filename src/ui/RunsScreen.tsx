import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadConnectionSettings } from '../api/connection';
import { listRuns, retryRun, stopRun } from '../api/runs';
import { runStatusTone, runToRow, shouldAutoRefreshRuns } from '../domain/runView';
import './console.css';

// The run APIs preserve the existing query and mutation behavior while this screen only changes presentation.
// runToRow and runStatusTone convert daemon data into the display values and semantic status treatment below.
export function RunsScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const s = loadConnectionSettings();
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['runs'],
    queryFn: () => listRuns(s, { limit: 50 }),
    refetchInterval: (q) => (shouldAutoRefreshRuns(q.state.data ?? []) ? 5000 : false),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['runs'] });

  const stopMutation = useMutation({
    mutationFn: async (runId: string) => {
      await stopRun(s, runId, 'user clicked stop');
    },
    onSuccess: () => {
      setStoppingId(null);
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (runId: string) => retryRun(s, runId),
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
      navigate(`/console/runs/${run.runId}`);
    },
  });

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
  const stoppingRow = rows.find((r) => r.runId === stoppingId);

  return (
    <section className="console-page">
      <div className="console-page__head">
        <h2>运行记录</h2>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={refresh}>刷新</button>
      </div>
      {rows.length === 0 ? (
        <p>还没有运行记录。去「我的 AI 助手」点「立即运行」，第一个结果就会出现在这里。</p>
      ) : (
        <div className="runs-table-wrap">
          <table className="runs-table">
            <thead>
              <tr>
                <th>AI 助手</th>
                <th>运行 ID</th>
                <th>来源</th>
                <th>状态</th>
                <th>耗时</th>
                <th>开始时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} onClick={() => navigate(`/console/runs/${r.runId}`)}>
                  <td>{r.agentName}</td>
                  <td>#{r.runShortId}</td>
                  <td>{r.sourceLabel}</td>
                  <td>
                    <span className={`run-status run-status--${runStatusTone(r.status)}`}>{r.statusLabel}</span>
                  </td>
                  <td>{r.durationText}</td>
                  <td>{r.startedText}</td>
                  <td>
                    {!r.terminal ? (
                      <button type="button" className="setup-btn setup-btn--ghost" onClick={(e) => { e.stopPropagation(); setStoppingId(r.runId); }}>停止</button>
                    ) : (
                      <button type="button" className="setup-btn setup-btn--ghost" onClick={(e) => { e.stopPropagation(); retryMutation.mutate(r.runId); }} disabled={retryMutation.isPending}>再次运行</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stoppingRow && (
        <div className="auth-overlay" role="dialog" aria-label="停止确认">
          <div>
            <h3>停止这次运行？</h3>
            <p>正在进行的任务会立刻中断，已写入的结果不会保留。</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={stopMutation.isPending} onClick={() => stopMutation.mutate(stoppingRow.runId)}>
                {stopMutation.isPending ? '停止中…' : '确认停止'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setStoppingId(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
