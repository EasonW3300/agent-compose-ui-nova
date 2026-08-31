import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { RunEventKind, type RunEvent } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { loadConnectionSettings } from '../api/connection';
import { getRun, listRunEvents, retryRun, stopRun } from '../api/runs';
import { runStatusLabel } from '../domain/agentCard';
import { describeRunEventKind, describeRunSource, formatClockTime, formatDuration, formatTime, isRunTerminal, runStatusTone } from '../domain/runView';
import { useRunLogs } from '../hooks/useRunLogs';
import './console.css';

export function RunDetailScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { runId = '' } = useParams();
  const s = loadConnectionSettings();
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const [extraEvents, setExtraEvents] = useState<RunEvent[]>([]);
  const [noMore, setNoMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | RunEventKind>('all');

  const runQuery = useQuery({
    queryKey: ['run', runId],
    queryFn: () => getRun(s, runId),
    enabled: Boolean(runId),
  });
  const eventsQuery = useQuery({
    queryKey: ['run-events', runId],
    queryFn: () => listRunEvents(s, runId, { limit: 20 }),
    enabled: Boolean(runId),
  });

  // runId 切换时清掉累积的更多分页与错误态
  // oxlint-disable react/set-state-in-effect -- extraEvents/noMore/loadMoreError 是按 runId 累积的本地态，runId 变化必须重置
  useEffect(() => {
    setExtraEvents([]);
    setNoMore(false);
    setLoadMoreError(false);
  }, [runId]);
  // oxlint-enable react/set-state-in-effect

  const events = [...(eventsQuery.data?.events ?? []), ...extraEvents];
  const canLoadMore = Boolean(eventsQuery.data) && (eventsQuery.data?.historyAvailable ?? false) && (eventsQuery.data?.total ?? 0) > events.length && !noMore;

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const res = await listRunEvents(s, runId, { limit: 20, offset: events.length });
      setExtraEvents((prev) => [...prev, ...res.events]);
      if (res.events.length === 0 || !res.historyAvailable || events.length + res.events.length >= res.total) {
        setNoMore(true);
      }
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleEvents = kindFilter === 'all' ? events : events.filter((ev) => ev.kind === kindFilter);
  const logs = useRunLogs(s, runId || null, { tailLines: 200, follow: true, includeMetadata: true });

  const stopMutation = useMutation({
    mutationFn: async () => {
      await stopRun(s, runId, 'user clicked stop');
    },
    onSuccess: () => {
      setConfirmingStop(false);
      queryClient.invalidateQueries({ queryKey: ['run', runId] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => retryRun(s, runId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      navigate(`/console/runs/${run.runId}`);
    },
  });

  // 新日志行到达时自动滚到底。
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'end' });
  }, [logs.lines.length]);

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logs.lines.map((l) => l.text).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };

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
        <div className="runs-actions">
          <button type="button" className="setup-btn" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
            {retryMutation.isPending ? '正在重新运行…' : '重新运行一次'}
          </button>
          <button type="button" className="setup-btn setup-btn--ghost" onClick={() => navigate('/console/runs')}>返回运行记录</button>
        </div>
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

      {retryMutation.isError && <div className="run-banner__error" role="alert">重新运行失败，请稍后再试。</div>}

      {!terminal && (
        <div className="run-section">
          <button type="button" className="setup-btn" onClick={() => setConfirmingStop(true)}>停止这次运行</button>
        </div>
      )}

      <div className="run-section">
        <div className="run-section__head">
          <h3>日志</h3>
          <div className="runs-actions">
            {logs.connected ? <span className="dash-live">实时</span> : <span className="dash-live dash-live--off">{logs.error ?? '已结束'}</span>}
            <button type="button" className="setup-btn setup-btn--ghost" onClick={copyLogs} disabled={logs.lines.length === 0}>{copied ? '已复制' : '复制日志'}</button>
          </div>
        </div>
        {logs.lines.length === 0 ? (
          <p className="run-section__empty">还没有日志输出。</p>
        ) : (
          <div className="run-logs" role="log">
            {logs.lines.map((l) => (
              <div key={l.id} className="run-log-line">
                {l.at && <span className="run-log-time">{formatClockTime(l.at)}</span>}
                {l.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      <div className="run-section">
        <div className="run-section__head"><h3>事件时间线</h3></div>
        {events.length === 0 ? (
          <p className="run-section__empty">暂无事件。</p>
        ) : (
          <>
            <div className="run-events__toolbar">
              <label>
                类型
                <select aria-label="事件类型筛选" value={kindFilter} onChange={(e) => setKindFilter(e.target.value === 'all' ? 'all' : (Number(e.target.value) as RunEventKind))}>
                  <option value="all">全部</option>
                  <option value={RunEventKind.USER_MESSAGE}>你的消息</option>
                  <option value={RunEventKind.AGENT_MESSAGE}>助手消息</option>
                  <option value={RunEventKind.AGENT_ACTIVITY}>助手活动</option>
                  <option value={RunEventKind.STATUS}>状态变化</option>
                </select>
              </label>
            </div>
            <div className="run-events">
              {visibleEvents.map((ev) => (
                <div key={ev.id} className="run-event">
                  <span className="run-event__kind">{describeRunEventKind(ev.kind)}</span>
                  {ev.createdAt && <span className="run-event__time">{formatTime(timestampDate(ev.createdAt))}</span>}
                  {ev.text && <span className="run-event__text">{ev.text}</span>}
                  {!ev.success && (
                    <span className="run-event__fail">
                      {ev.exitCode !== 0 ? `退出码 ${ev.exitCode}` : ''}
                      {ev.exitCode !== 0 && ev.stopReason ? ' · ' : ''}
                      {ev.stopReason || ''}
                    </span>
                  )}
                  {ev.payloadJson && (
                    <details className="run-event__payload">
                      <summary>载荷</summary>
                      <pre>{ev.payloadJson}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
            {canLoadMore && (
              <button type="button" className="setup-btn setup-btn--ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? '加载中…' : '加载更多'}
              </button>
            )}
            {loadMoreError && <p className="run-section__empty" role="alert">加载更多失败，请重试。</p>}
          </>
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
