import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import { createWorkspacePreset, deleteWorkspacePreset, getWorkspacePresets, updateWorkspacePreset } from '../api/settings';
import type { WorkspacePreset } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { DANGEROUS_ACTIONS, describePresetType } from '../domain/resourceView';
import './console.css';

interface PresetDraft { id: string | null; name: string; type: string; configJson: string; }
const EMPTY: PresetDraft = { id: null, name: '', type: 'empty', configJson: '' };

export function PresetsTab() {
  const queryClient = useQueryClient();
  const s = loadConnectionSettings();
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['workspace-presets'],
    queryFn: () => getWorkspacePresets(s),
  });
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const [deleting, setDeleting] = useState<WorkspacePreset | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workspace-presets'] });
  const saveMutation = useMutation({
    mutationFn: async (d: PresetDraft) => {
      if (d.id) await updateWorkspacePreset(s, { presetId: d.id, name: d.name, type: d.type, configJson: d.configJson });
      else await createWorkspacePreset(s, { name: d.name, type: d.type, configJson: d.configJson });
    },
    onSuccess: () => { setDraft(null); invalidate(); },
  });
  const deleteMutation = useMutation({
    mutationFn: async (p: WorkspacePreset) => { await deleteWorkspacePreset(s, p.id); },
    onSuccess: () => { setDeleting(null); invalidate(); },
  });

  if (isLoading) return <p role="status">正在加载工作区预设…</p>;
  if (isError) return <p role="alert">连不上 agent-compose，加载失败。</p>;

  return (
    <div className="res-section">
      <div className="run-section__head">
        <h3>工作区预设</h3>
        <button type="button" className="setup-btn" onClick={() => setDraft(EMPTY)}>+ 新建预设</button>
      </div>
      {data.length === 0 ? (
        <p className="run-section__empty">还没有工作区预设。新建一个，向导里选「工作材料」时就能直接用。</p>
      ) : (
        <table className="runs-table">
          <thead><tr><th>名称</th><th>类型</th><th></th></tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{describePresetType(p.type)}</td>
                <td>
                  <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setDraft({ id: p.id, name: p.name, type: p.type, configJson: p.configJson })}>编辑</button>{' '}
                  <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setDeleting(p)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {draft && (
        <div className="auth-overlay" role="dialog" aria-label={draft.id ? '编辑预设' : '新建预设'}>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(draft); }}>
            <h3>{draft.id ? '编辑预设' : '新建预设'}</h3>
            <label>
              预设名称
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="预设名称" required />
            </label>
            <label>
              类型
              <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} aria-label="类型">
                <option value="empty">空工作区</option>
                <option value="git">Git 仓库</option>
                <option value="path">本地路径</option>
              </select>
            </label>
            <details className="wizard-advanced">
              <summary>进阶：configJson</summary>
              <textarea value={draft.configJson} onChange={(e) => setDraft({ ...draft, configJson: e.target.value })} rows={4} aria-label="configJson" />
            </details>
            <div className="auth-overlay__actions">
              <button type="submit" className="setup-btn" disabled={saveMutation.isPending || !draft.name.trim()}>
                {draft.id ? '保存' : '创建'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setDraft(null)}>取消</button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="auth-overlay" role="dialog" aria-label="删除确认">
          <div>
            <h3>删除「{deleting.name}」？</h3>
            <p>{DANGEROUS_ACTIONS.removePreset}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleting)}>
                {deleteMutation.isPending ? '删除中…' : '确认删除'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setDeleting(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
