import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { loadConnectionSettings } from '../api/connection';
import { projectRefByName, removeProject, setAgentEnabled, startAgentRun } from '../api/projects';
import { useAgents } from '../hooks/useAgents';
import type { AgentCard as AgentCardModel } from '../domain/agentCard';
import { AgentCard } from './AgentCard';
import './console.css';

export function AgentListScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useAgents();
  const [confirming, setConfirming] = useState<AgentCardModel | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['agents'] });

  const runMutation = useMutation({
    mutationFn: async (c: AgentCardModel) => {
      const s = loadConnectionSettings();
      return startAgentRun(s, { projectId: c.projectId, agentName: c.agentName, prompt: c.prompt });
    },
    onSuccess: (run) => {
      invalidate();
      navigate(`/console/runs/${run.runId}`);
    },
  });
  const toggleMutation = useMutation({
    mutationFn: async (c: AgentCardModel) => {
      const s = loadConnectionSettings();
      await setAgentEnabled(s, projectRefByName(c.projectName), c.agentName, !c.enabled);
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
