import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import './console.css';

export function DashboardScreen() {
  const navigate = useNavigate();
  const { overview, isLoading, isError, connected, refetch } = useDashboard();
  const runs = overview?.runs;

  if (isLoading) return <div className="console-page" role="status">正在加载首页…</div>;
  if (isError) {
    return (
      <div className="console-page">
        <p role="alert">加载失败，连不上 agent-compose。</p>
        <button type="button" className="setup-btn" onClick={refetch}>重试</button>
      </div>
    );
  }

  const runningCount = runs?.runningCount ?? 0;
  const recentCount = runs?.recentCount ?? 0;
  const attentionCount = runs?.attentionCount ?? 0;

  return (
    <section className="console-page">
      <div className="console-page__head">
        <h2>首页</h2>
        {connected ? (
          <span className="dash-live">实时</span>
        ) : (
          <span className="dash-live dash-live--off">连接中…</span>
        )}
      </div>

      <div className="dash-grid">
        <div className="dash-card">
          <div className="dash-card__num">{runningCount}</div>
          <div className="dash-card__label">运行中的 AI 助手</div>
        </div>
        <div className="dash-card">
          <div className="dash-card__num">{recentCount}</div>
          <div className="dash-card__label">今日运行次数</div>
        </div>
        <div className="dash-card dash-card--warn">
          <div className="dash-card__num">{attentionCount}</div>
          <div className="dash-card__label">需要留意的运行</div>
        </div>
      </div>

      <div className="dash-block">
        {attentionCount > 0 ? (
          <p role="alert">
            {attentionCount === 1 ? '有 1 次运行出了点问题。' : `有 ${attentionCount} 次运行出了点问题。`}{' '}
            <button type="button" className="setup-btn setup-btn--ghost" onClick={() => navigate('/console/runs')}>
              查看日志
            </button>
          </p>
        ) : (
          <p>最近运行一切正常。</p>
        )}
      </div>

      <div className="dash-block dash-block--links">
        <button type="button" className="setup-btn" onClick={() => navigate('/console/agents/new')}>
          + 新建 AI 助手
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => navigate('/console/agents')}>
          管理我的 AI 助手
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => navigate('/console/runs')}>
          查看运行记录
        </button>
      </div>
    </section>
  );
}
