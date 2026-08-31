import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import { createVolume, listVolumes, pruneVolumes, removeVolume } from '../api/resources';
import type { Volume } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { DANGEROUS_ACTIONS } from '../domain/resourceView';
import './console.css';

const EMPTY = { name: '', driver: 'local' };

export function VolumesTab() {
  const queryClient = useQueryClient();
  const s = loadConnectionSettings();
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['volumes'], queryFn: () => listVolumes(s) });
  const [draft, setDraft] = useState<typeof EMPTY | null>(null);
  const [removing, setRemoving] = useState<Volume | null>(null);
  const [confirmingPrune, setConfirmingPrune] = useState(false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['volumes'] });

  const createMutation = useMutation({
    mutationFn: async (v: typeof EMPTY) => { await createVolume(s, v); },
    onSuccess: () => { setDraft(null); invalidate(); },
  });
  const removeMutation = useMutation({
    mutationFn: async (v: Volume) => { await removeVolume(s, v.name); },
    onSuccess: () => { setRemoving(null); invalidate(); },
  });
  const pruneMutation = useMutation({
    mutationFn: async () => { await pruneVolumes(s); },
    onSuccess: () => { setConfirmingPrune(false); invalidate(); },
  });

  if (isLoading) return <p role="status">正在加载数据卷…</p>;
  if (isError) return <p role="alert">连不上 agent-compose，加载失败。</p>;

  return (
    <div className="res-section">
      <div className="run-section__head">
        <h3>数据卷</h3>
        <div>
          <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingPrune(true)}>清理未使用的卷</button>{' '}
          <button type="button" className="setup-btn" onClick={() => setDraft(EMPTY)}>+ 新建数据卷</button>
        </div>
      </div>
      {data.length === 0 ? (
        <p className="run-section__empty">还没有数据卷。</p>
      ) : (
        <table className="runs-table">
          <thead><tr><th>名称</th><th>驱动</th><th>路径</th><th></th></tr></thead>
          <tbody>
            {data.map((v) => (
              <tr key={v.name}>
                <td>{v.name}</td><td>{v.driver}</td><td>{v.path}</td>
                <td><button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemoving(v)}>删除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {draft && (
        <div className="auth-overlay" role="dialog" aria-label="新建数据卷">
          <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(draft); }}>
            <h3>新建数据卷</h3>
            <label>名称<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="名称" required /></label>
            <label>驱动<input value={draft.driver} onChange={(e) => setDraft({ ...draft, driver: e.target.value })} aria-label="驱动" /></label>
            <div className="auth-overlay__actions">
              <button type="submit" className="setup-btn" disabled={createMutation.isPending || !draft.name.trim()}>创建</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setDraft(null)}>取消</button>
            </div>
          </form>
        </div>
      )}

      {removing && (
        <div className="auth-overlay" role="dialog" aria-label="删除确认">
          <div>
            <h3>删除数据卷「{removing.name}」？</h3>
            <p>{DANGEROUS_ACTIONS.removeVolume}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(removing)}>
                {removeMutation.isPending ? '删除中…' : '确认删除'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemoving(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {confirmingPrune && (
        <div className="auth-overlay" role="dialog" aria-label="清理确认">
          <div>
            <h3>清理未使用的数据卷？</h3>
            <p>{DANGEROUS_ACTIONS.pruneVolumes}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={pruneMutation.isPending} onClick={() => pruneMutation.mutate()}>
                {pruneMutation.isPending ? '清理中…' : '确认清理'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingPrune(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
