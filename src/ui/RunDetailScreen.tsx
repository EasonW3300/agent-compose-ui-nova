import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { loadConnectionSettings } from '../api/connection';
import { getRun, listRunEvents, stopRun } from '../api/runs';
import { runStatusLabel } from '../domain/agentCard';
import { describeRunEventKind, describeRunSource, formatDuration, formatTime, isRunTerminal, runStatusTone } from '../domain/runView';
import { useRunLogs } from '../hooks/useRunLogs';
import './console.css';

export function RunDetailScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { runId = '' } = useParams();
  const s = loadConnectionSettings();
  const [confirmingStop, setConfirmingStop] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const runQuery = useQuery({
    queryKey: ['run', runId],
    queryFn: () => getRun(s, runId),
    enabled: Boolean(runId),
  });
  const eventsQuery = useQuery({
    queryKey: ['run-events', runId],
    queryFn: () => listRunEvents(s, runId, { limit: 200 }),
    enabled: Boolean(runId),
  });
  const logs = useRunLogs(s, runId || null, { tailLines: 200, follow: true });

  const stopMutation = useMutation({
    mutationFn: async () => {
      await stopRun(s, runId, 'user clicked stop');
    },
    onSuccess: () => {
      setConfirmingStop(false);
      queryClient.invalidateQueries({ queryKey: ['run', runId] });
    },
  });

  // 新日志行到达时自动滚到底。
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [logs.lines.length]);

  if (runQuery.isLoading) return <div className="console-page" role="status">正在加载运行详情…</div>;
  const detail = runQuery.data;
  if (runQuery.isError || !detail || !detail.summary) {
    return (
      <div className="console-page">
        <p role="alert">找不到这次运行。</p>
        <button type="button" className="setup-btn" onClick={() => navigate('/console/runs')}>返回运行记录</button>
      </div>
    );
  }
  const summary = detail.summary;
  const terminal = isRunTerminal(summary.status);

  return (
    <section className="console-page">
      <div className="console-page__head">
        <h2>运行详情</h2>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => navigate('/console/runs')}>返回运行记录</button>
      </div>

      <div className={`run-banner run-banner--${runStatusTone(summary.status)}`}>
        <div>
          <strong>{summary.agentName}</strong>
          <span className="run-banner__meta">
            #{summary.runShortId || summary.runId.slice(0, 8)} · <span>{runStatusLabel(summary.status)}</span>
          </span>
        </div>
        <div className="run-banner__meta">
          来源：{describeRunSource(summary.source)} ·
          耗时：{formatDuration(summary.durationMs)} ·
          {summary.startedAt ? `开始于 ${formatTime(timestampDate(summary.startedAt))}` : '尚未开始'}
        </div>
        {summary.error && <div className="run-banner__error" role="alert">{summary.error}</div>}
      </div>

      {!terminal && (
        <div className="run-section">
          <button type="button" className="setup-btn" onClick={() => setConfirmingStop(true)}>停止这次运行</button>
        </div>
      )}

      <div className="run-section">
        <div className="run-section__head">
          <h3>日志</h3>
          {logs.connected ? <span className="dash-live">实时</span> : <span className="dash-live dash-live--off">{logs.error ?? '已结束'}</span>}
        </div>
        {logs.lines.length === 0 ? (
          <p className="run-section__empty">还没有日志输出。</p>
        ) : (
          <div className="run-logs" role="log">
            {logs.lines.map((l) => (
              <div key={l.id}>{l.text}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      <div className="run-section">
        <div className="run-section__head"><h3>事件时间线</h3></div>
        {(eventsQuery.data ?? []).length === 0 ? (
          <p className="run-section__empty">暂无事件。</p>
        ) : (
          <div className="run-events">
            {(eventsQuery.data ?? []).map((ev) => (
              <div key={ev.id} className="run-event">
                <span className="run-event__kind">{describeRunEventKind(ev.kind)}</span>
                {ev.createdAt && <span className="run-event__time">{formatTime(timestampDate(ev.createdAt))}</span>}
                {ev.text && <span className="run-event__text">{ev.text}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmingStop && (
        <div className="auth-overlay" role="dialog" aria-label="停止确认">
          <div>
            <h3>停止这次运行？</h3>
            <p>正在进行的任务会立刻中断，已写入的结果不会保留。</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={stopMutation.isPending} onClick={() => stopMutation.mutate()}>
                {stopMutation.isPending ? '停止中…' : '确认停止'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingStop(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
