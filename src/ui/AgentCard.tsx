import { PROVIDERS } from '../domain/labels';
import { describeAgentCardStatus, type AgentCard as AgentCardModel } from '../domain/agentCard';

// Agent-card domain mappings provide the human status label and semantic tone for this badge.

interface Props {
  card: AgentCardModel;
  busy?: boolean;
  onRun: (c: AgentCardModel) => void;
  onToggleEnabled: (c: AgentCardModel) => void;
  onEdit: (c: AgentCardModel) => void;
  onLogs: (c: AgentCardModel) => void;
  onDelete: (c: AgentCardModel) => void;
}

function formatDate(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function badgeClass(status: string): string {
  return `agent-card__badge agent-card__badge--${status}`;
}

export function AgentCard({ card, busy, onRun, onToggleEnabled, onEdit, onLogs, onDelete }: Props) {
  const provider = PROVIDERS.find((p) => p.id === card.provider);
  return (
    <article className="agent-card">
      <h3 className="agent-card__title">{card.displayName}</h3>
      <span className={badgeClass(card.status)} data-testid={`status-${card.status}`}>
        {describeAgentCardStatus(card.status)}
      </span>
      <p className="agent-card__meta">{provider?.label ?? card.provider}</p>
      {card.nextFireAt && (
        <p className="agent-card__meta">下次：{formatDate(card.nextFireAt)}</p>
      )}
      {card.latestRun && (
        <p className="agent-card__meta">
          最近：{card.latestRun.statusLabel}
          {card.latestRun.at ? ` · ${formatDate(card.latestRun.at)}` : ''}
        </p>
      )}
      <div className="agent-card__actions">
        <button type="button" className="setup-btn" disabled={busy} onClick={() => onRun(card)}>
          {card.status === 'working' ? '正在运行…' : '立即运行'}
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" disabled={busy} onClick={() => onToggleEnabled(card)}>
          {card.enabled ? '暂停' : '启用'}
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => onEdit(card)}>编辑</button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => onLogs(card)}>日志</button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => onDelete(card)}>删除</button>
      </div>
    </article>
  );
}
